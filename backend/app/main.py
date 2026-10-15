import asyncio
import hashlib
import json
import os
import secrets
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .database import connection, dictionary, initialize, products, save_product, settings
from .message_templates import MessageTemplates, load_templates, preview
from .notifications import worker
from .orders import analytics, change_status, create_order, list_orders
from .schemas import Checkout, DictionaryItem, Login, OrderStatus, PasswordChange, Product, Settings
from .security import change_password, login_session, rate_limit, require_admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    await initialize()
    task = asyncio.create_task(worker())
    yield
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task


app = FastAPI(
    title="КИП и А — API магазина",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
Admin = Annotated[None, Depends(require_admin)]


@app.middleware("http")
async def protect(request: Request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if origin and origin not in config.ORIGINS:
            return JSONResponse({"detail": "Источник запроса не разрешён"}, status_code=403)
        if request.headers.get("sec-fetch-site") == "cross-site":
            return JSONResponse({"detail": "Межсайтовый запрос запрещён"}, status_code=403)
        try:
            if int(request.headers.get("content-length", "0")) > 5_000_000:
                return JSONResponse({"detail": "Файл слишком большой"}, status_code=413)
        except ValueError:
            return JSONResponse({"detail": "Некорректный размер запроса"}, status_code=400)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
    else:
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        )
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    detail = "Проверьте введённые данные: имя, телефон, адрес и значения полей."
    if request.url.path == "/api/admin/password":
        detail = "Укажите старый пароль. Новый пароль: 8–200 символов, заглавная буква, цифра и специальный символ. Подтверждение должно совпадать."
    elif request.url.path.startswith("/api/admin/message-templates"):
        detail = "Проверьте шаблон: допустимые переменные, обязательные данные заказа, парные скобки и длину текста."
        custom = [
            e["msg"].removeprefix("Value error, ")
            for e in exc.errors()
            if e["type"] == "value_error"
        ]
        if custom:
            detail = " ".join(dict.fromkeys(custom))
    return JSONResponse(
        {
            "detail": detail,
            "fields": [".".join(str(x) for x in e["loc"][1:]) for e in exc.errors()],
        },
        status_code=422,
    )


@app.get("/api/catalog")
async def catalog():
    async with connection() as db:
        return {
            "products": [p for p in await products(db) if p["active"]],
            "categories": await dictionary(db, "categories"),
            "units": await dictionary(db, "units"),
            "settings": await settings(db),
        }


@app.post("/api/orders", status_code=201)
async def checkout(payload: Checkout, request: Request):
    await rate_limit("orders:" + (request.client.host if request.client else "local"), 15, 600)
    return await create_order(payload)


@app.post("/api/auth/login")
async def login(payload: Login, request: Request, response: Response):
    await rate_limit("login:" + (request.client.host if request.client else "local"), 8, 900)
    await rate_limit("login:account", 40, 900)
    token = await login_session(payload.password)
    response.set_cookie(
        "kip_session",
        token,
        max_age=28800,
        httponly=True,
        secure=config.SECURE_COOKIE,
        samesite="strict",
        path="/",
    )
    return {"ok": True}


@app.post("/api/admin/password")
async def update_password(
    payload: PasswordChange, request: Request, response: Response, admin: Admin
):
    await rate_limit("password:account", 5, 900)
    await change_password(
        payload.old_password, payload.new_password, request.cookies.get("kip_session", "")
    )
    response.delete_cookie("kip_session", path="/")
    return {"ok": True}


@app.get("/api/auth/me")
async def me(admin: Admin):
    return {"ok": True}


@app.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("kip_session", "")
    async with connection() as db:
        await db.execute(
            "DELETE FROM sessions WHERE token=?", (hashlib.sha256(token.encode()).hexdigest(),)
        )
    response.delete_cookie("kip_session", path="/")
    return {"ok": True}


@app.get("/api/admin/catalog")
async def admin_catalog(admin: Admin):
    async with connection() as db:
        return {
            "products": await products(db),
            "categories": await dictionary(db, "categories"),
            "units": await dictionary(db, "units"),
            "settings": await settings(db),
        }


async def validate_product_refs(db, product: Product) -> None:
    if product.category not in [c["id"] for c in await dictionary(db, "categories")]:
        raise HTTPException(422, "Категория не найдена")
    if product.unit not in [
        u["symbol"] for u in await dictionary(db, "units") if u["kind"] == "sale"
    ]:
        raise HTTPException(422, "Единица продажи не найдена")
    rows = await (
        await db.execute("SELECT data FROM orders WHERE status IN ('new','confirmed')")
    ).fetchall()
    for row in rows:
        for item in json.loads(row["data"])["items"]:
            if item["product_id"] == product.id and (
                item["variant_id"] not in [v.id for v in product.variants]
                or item["unit"] != product.unit
                or item.get("kind", "product") != product.kind
            ):
                raise HTTPException(
                    409, "Нельзя менять единицы или удалять варианты товара с активными заказами"
                )


@app.post("/api/admin/products", status_code=201)
async def add_product(payload: Product, admin: Admin):
    async with connection() as db:
        await db.execute("BEGIN IMMEDIATE")
        if await (await db.execute("SELECT 1 FROM products WHERE id=?", (payload.id,))).fetchone():
            raise HTTPException(409, "Товар с таким артикулом уже существует")
        await validate_product_refs(db, payload)
        await save_product(db, payload.model_dump())
    return {"ok": True}


@app.put("/api/admin/products/{product_id}")
async def edit_product(product_id: str, payload: Product, admin: Admin):
    if product_id != payload.id:
        raise HTTPException(422, "Артикул нельзя изменить")
    async with connection() as db:
        await db.execute("BEGIN IMMEDIATE")
        if not await (
            await db.execute("SELECT 1 FROM products WHERE id=?", (product_id,))
        ).fetchone():
            raise HTTPException(404, "Товар не найден")
        current = json.loads(
            (
                await (
                    await db.execute("SELECT data FROM products WHERE id=?", (product_id,))
                ).fetchone()
            )["data"]
        )
        if current.get("version", 0) != payload.version:
            raise HTTPException(
                409,
                "Товар изменился после открытия формы. Закройте форму, обновите страницу и повторите редактирование.",
            )
        await validate_product_refs(db, payload)
        await save_product(db, payload.model_dump())
    return {"ok": True}


@app.delete("/api/admin/products/{product_id}")
async def delete_product(product_id: str, admin: Admin):
    async with connection() as db:
        await db.execute("BEGIN IMMEDIATE")
        rows = await (
            await db.execute("SELECT data FROM orders WHERE status IN ('new','confirmed')")
        ).fetchall()
        if any(
            any(i["product_id"] == product_id for i in json.loads(r["data"])["items"]) for r in rows
        ):
            raise HTTPException(409, "Сначала завершите активные заказы с этим товаром")
        cursor = await db.execute("DELETE FROM products WHERE id=?", (product_id,))
        if not cursor.rowcount:
            raise HTTPException(404, "Товар не найден")
    return {"ok": True}


@app.post("/api/admin/dictionaries/{kind}", status_code=201)
async def add_dictionary(
    kind: Literal["categories", "units"], payload: DictionaryItem, admin: Admin
):
    async with connection() as db:
        await db.execute("BEGIN IMMEDIATE")
        existing = await dictionary(db, kind)
        if any(
            x["id"] == payload.id
            or x["name"].lower() == payload.name.lower()
            or (kind == "units" and x.get("symbol") == payload.symbol)
            for x in existing
        ):
            raise HTTPException(409, "Такая запись уже существует")
        if kind == "units" and not payload.symbol:
            raise HTTPException(422, "Укажите обозначение единицы")
        await db.execute(
            "INSERT INTO dictionaries VALUES(?,?,?)", (kind, payload.id, payload.model_dump_json())
        )
    return {"ok": True}


@app.delete("/api/admin/dictionaries/{kind}/{item_id}")
async def remove_dictionary(kind: Literal["categories", "units"], item_id: str, admin: Admin):
    async with connection() as db:
        await db.execute("BEGIN IMMEDIATE")
        item = next((x for x in await dictionary(db, kind) if x["id"] == item_id), None)
        if not item:
            raise HTTPException(404, "Запись не найдена")
        catalog = await products(db)
        if any(
            (
                p["category"] == item_id
                if kind == "categories"
                else p["unit"] == item["symbol"]
                or any(item["symbol"] in v.split() for v in p["specs"].values())
            )
            for p in catalog
        ):
            raise HTTPException(409, "Запись используется в товарах")
        await db.execute("DELETE FROM dictionaries WHERE kind=? AND id=?", (kind, item_id))
    return {"ok": True}


@app.put("/api/admin/settings")
async def edit_settings(payload: Settings, admin: Admin):
    async with connection() as db:
        await db.execute("BEGIN IMMEDIATE")
        current = await settings(db)
        await db.execute(
            "UPDATE settings SET data=? WHERE id=1",
            (json.dumps({**current, **payload.model_dump()}, ensure_ascii=False),),
        )
    return {"ok": True}


@app.get("/api/admin/message-templates")
async def get_message_templates(admin: Admin):
    async with connection() as db:
        return await load_templates(db)


@app.put("/api/admin/message-templates")
async def save_message_templates(payload: MessageTemplates, admin: Admin):
    async with connection() as db:
        await db.execute(
            "INSERT INTO notification_templates VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
            (payload.model_dump_json(),),
        )
    return {"ok": True}


@app.post("/api/admin/message-templates/preview")
async def preview_message_templates(payload: MessageTemplates, admin: Admin):
    return preview(payload)


@app.get("/api/admin/orders")
async def get_orders(admin: Admin):
    return await list_orders()


@app.patch("/api/admin/orders/{order_id}")
async def update_status(order_id: str, payload: OrderStatus, admin: Admin):
    await change_status(order_id, payload.status)
    return {"ok": True}


@app.post("/api/admin/orders/{order_id}/retry")
async def retry_notifications(order_id: str, admin: Admin):
    async with connection() as db:
        await db.execute(
            "UPDATE notifications SET status='pending',attempts=0,retry_at=0,error='' WHERE order_id=? AND status IN ('failed','unconfigured')",
            (order_id,),
        )
    return {"ok": True}


@app.get("/api/admin/analytics")
async def stats(admin: Admin, days: int = 30):
    if days not in {7, 30}:
        raise HTTPException(422, "Выберите период 7 или 30 дней")
    return await analytics(days)


@app.get("/api/admin/integrations")
async def integrations(admin: Admin):
    return {
        "telegram": all(os.getenv(k) for k in ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]),
        "whatsapp": all(
            os.getenv(k)
            for k in [
                "WHATSAPP_TOKEN",
                "WHATSAPP_PHONE_ID",
                "WHATSAPP_TEMPLATE",
                "WHATSAPP_RECIPIENT",
            ]
        ),
    }


@app.post("/api/admin/images", status_code=201)
async def upload_image(request: Request, admin: Admin):
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > 4_000_000:
            raise HTTPException(413, "Максимальный размер изображения — 4 МБ")
    data = bytes(content)
    ext = (
        "png"
        if data.startswith(b"\x89PNG\r\n\x1a\n")
        else "jpg"
        if data.startswith(b"\xff\xd8\xff")
        else "webp"
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP"
        else None
    )
    if not ext:
        raise HTTPException(422, "Загрузите PNG, JPEG или WebP")
    directory = Path(config.DB_PATH).parent / "uploads"
    await asyncio.to_thread(directory.mkdir, parents=True, exist_ok=True)
    filename = secrets.token_hex(16) + "." + ext
    await asyncio.to_thread((directory / filename).write_bytes, data)
    return {"url": "/api/media/" + filename}


@app.get("/api/media/{filename}")
async def media(filename: str):
    import re

    if not re.fullmatch(r"[a-f0-9]{32}\.(png|jpg|webp)", filename):
        raise HTTPException(404, "Изображение не найдено")
    path = Path(config.DB_PATH).parent / "uploads" / filename
    if not path.is_file():
        raise HTTPException(404, "Изображение не найдено")
    return FileResponse(path)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


if (config.ROOT / "dist").exists():
    app.mount("/assets", StaticFiles(directory=config.ROOT / "dist/assets"), name="assets")

    @app.get("/{path:path}")
    async def frontend(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Маршрут не найден")
        candidate = (config.ROOT / "dist" / path).resolve()
        if candidate.is_relative_to((config.ROOT / "dist").resolve()) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(config.ROOT / "dist/index.html")
