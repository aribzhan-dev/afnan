import asyncio
import copy
import hashlib
import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app import config
from backend.app.database import connection
from backend.app.main import app
from backend.app.orders import create_order
from backend.app.schemas import Checkout


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("SEED_DEMO_DATA", "true")
    salt = "test-salt"
    monkeypatch.setenv(
        "ADMIN_PASSWORD_HASH",
        salt + ":" + hashlib.pbkdf2_hmac("sha256", b"test-password", salt.encode(), 600_000).hex(),
    )
    for key in [
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_CHAT_ID",
        "WHATSAPP_TOKEN",
        "WHATSAPP_PHONE_ID",
        "WHATSAPP_TEMPLATE",
    ]:
        monkeypatch.delenv(key, raising=False)
    with TestClient(app) as c:
        yield c


def admin(client):
    assert client.post("/api/auth/login", json={"password": "test-password"}).status_code == 200


def payload(**changes):
    data = {
        "request_id": str(uuid4()),
        "name": "Тестовый Клиент",
        "phone": "+77000000000",
        "delivery": "pickup",
        "city": "Шымкент",
        "address": "",
        "comment": "Тест",
        "consent": True,
        "items": [{"product_id": "breaker-1", "variant_id": "c16", "quantity": 2}],
    }
    return {**data, **changes}


def test_catalog_and_auth_boundary(client):
    data = client.get("/api/catalog").json()
    assert len(data["products"]) == 9
    assert data["settings"]["phone"] == "+77079565657"
    assert client.get("/api/admin/orders").status_code == 401
    assert client.put("/api/admin/settings", json={}).status_code == 401
    assert client.post("/api/auth/login", json={"password": "wrong"}).status_code == 401
    admin(client)
    assert client.get("/api/auth/me").status_code == 200
    cookie = client.cookies.get("kip_session")
    assert cookie
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/admin/orders").status_code == 401


@pytest.mark.parametrize(
    "changes",
    [
        {"name": "Иван123"},
        {"phone": "+770012345678"},
        {"phone": "+79123456789"},
        {"phone": "+7700abc0000"},
        {"consent": False},
        {"delivery": "delivery", "address": "ул"},
        {"items": [{"product_id": "breaker-1", "variant_id": "c16", "quantity": 1.5}]},
    ],
)
def test_invalid_checkout_rejected(client, changes):
    assert client.post("/api/orders", json=payload(**changes)).status_code == 422
    admin(client)
    assert client.get("/api/admin/orders").json() == []


def test_discount_server_total_idempotency_and_stock(client):
    body = payload()
    response = client.post("/api/orders", json=body)
    assert response.status_code == 201, response.text
    order = response.json()
    assert order["total"] == 4080
    assert order["whatsapp_url"].startswith("https://wa.me/77079565657?text=")
    assert client.post("/api/orders", json=body).json()["id"] == order["id"]
    assert client.post("/api/orders", json={**body, "name": "Другой Клиент"}).status_code == 409
    catalog = client.get("/api/catalog").json()
    assert next(v for v in catalog["products"][0]["variants"] if v["id"] == "c16")["stock"] == 48
    admin(client)
    orders = client.get("/api/admin/orders").json()
    assert len(orders) == 1
    assert orders[0]["items"][0]["unit_price"] == 2040
    assert orders[0]["whatsapp_url"].startswith("https://wa.me/77000000000?text=")
    assert "request_id" not in orders[0]


def test_stock_transaction_rolls_back(client):
    body = payload(
        items=[
            {"product_id": "breaker-1", "variant_id": "c16", "quantity": 2},
            {"product_id": "cable-vvg", "variant_id": "cable-vvg-base", "quantity": 9999},
        ]
    )
    assert client.post("/api/orders", json=body).status_code == 409
    p = client.get("/api/catalog").json()["products"][0]
    assert next(v for v in p["variants"] if v["id"] == "c16")["stock"] == 50


def test_fractional_cable_and_status_analytics(client):
    order = client.post(
        "/api/orders",
        json=payload(
            items=[{"product_id": "cable-vvg", "variant_id": "cable-vvg-base", "quantity": 2.5}]
        ),
    ).json()
    assert order["total"] == 2225
    admin(client)
    assert client.get("/api/admin/analytics?days=7").status_code == 200
    assert client.get("/api/admin/analytics?days=7").json()["revenue"] == 0
    assert (
        client.patch("/api/admin/orders/" + order["id"], json={"status": "completed"}).status_code
        == 409
    )
    assert (
        client.patch("/api/admin/orders/" + order["id"], json={"status": "confirmed"}).status_code
        == 200
    )
    assert (
        client.patch("/api/admin/orders/" + order["id"], json={"status": "completed"}).status_code
        == 200
    )
    stats = client.get("/api/admin/analytics?days=30").json()
    assert stats["revenue"] == 2225 and stats["orders"] == 1
    assert stats["quantities"] == {"м": 2.5}
    assert stats["top"][0]["quantity"] == 2.5
    assert sum(p["value"] for p in stats["series"]) == 2225
    assert (
        client.patch("/api/admin/orders/" + order["id"], json={"status": "cancelled"}).status_code
        == 409
    )


def test_cancel_restock_once_and_edit_protection(client):
    order = client.post("/api/orders", json=payload()).json()
    admin(client)
    p = client.get("/api/admin/catalog").json()["products"][0]
    assert client.delete("/api/admin/products/" + p["id"]).status_code == 409
    removed = copy.deepcopy(p)
    removed["variants"] = [v for v in p["variants"] if v["id"] != "c16"]
    assert client.put("/api/admin/products/" + p["id"], json=removed).status_code == 409
    for _ in range(2):
        assert (
            client.patch(
                "/api/admin/orders/" + order["id"], json={"status": "cancelled"}
            ).status_code
            == 200
        )
    p = client.get("/api/catalog").json()["products"][0]
    assert next(v for v in p["variants"] if v["id"] == "c16")["stock"] == 50
    assert client.get("/api/admin/analytics").json()["revenue"] == 0


def test_product_dictionary_settings_crud(client):
    admin(client)
    catalog = client.get("/api/admin/catalog").json()
    product = copy.deepcopy(catalog["products"][0])
    product["id"] = "test-product"
    product["name"] = "Новый автомат"
    product["discount_enabled"] = False
    assert client.post("/api/admin/products", json=product).status_code == 201
    assert client.post("/api/admin/products", json=product).status_code == 409
    product = next(
        p for p in client.get("/api/admin/catalog").json()["products"] if p["id"] == "test-product"
    )
    product["description"] = "Изменённое описание товара для проверки."
    assert client.put("/api/admin/products/test-product", json=product).status_code == 200
    assert client.delete("/api/admin/products/test-product").status_code == 200
    assert (
        client.post(
            "/api/admin/dictionaries/units",
            json={"id": "pack", "name": "Упаковка", "symbol": "уп", "kind": "sale"},
        ).status_code
        == 201
    )
    assert client.delete("/api/admin/dictionaries/units/meter").status_code == 409
    assert client.delete("/api/admin/dictionaries/units/pack").status_code == 200
    settings = {
        k: v
        for k, v in catalog["settings"].items()
        if k in ["phone", "address", "hours", "about", "delivery_note", "demo"]
    }
    settings["hours"] = "Пн–Сб: 09:00–19:00"
    settings["demo"] = False
    assert client.put("/api/admin/settings", json=settings).status_code == 200
    assert client.get("/api/catalog").json()["settings"]["demo"] is False
    assert (
        client.put("/api/admin/settings", json={**settings, "name": "Другой магазин"}).status_code
        == 422
    )


def test_csrf_and_login_rate_limit(client):
    assert (
        client.post(
            "/api/auth/login",
            json={"password": "test-password"},
            headers={"origin": "https://evil.example"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/orders", json=payload(), headers={"sec-fetch-site": "cross-site"}
        ).status_code
        == 403
    )
    for _ in range(8):
        assert client.post("/api/auth/login", json={"password": "wrong"}).status_code == 401
    assert client.post("/api/auth/login", json={"password": "test-password"}).status_code == 429


def test_extra_price_and_duplicate_items_rejected(client):
    body = payload()
    body["items"][0]["price"] = 1
    assert client.post("/api/orders", json=body).status_code == 422
    body = payload()
    body["items"].append(body["items"][0])
    assert client.post("/api/orders", json=body).status_code == 422


def test_parallel_orders_cannot_oversell(client):
    admin(client)
    p = client.get("/api/admin/catalog").json()["products"][0]
    for v in p["variants"]:
        v["stock"] = 1
    assert client.put("/api/admin/products/" + p["id"], json=p).status_code == 200

    async def race():
        return await asyncio.gather(
            *(
                create_order(
                    Checkout(
                        **payload(
                            items=[{"product_id": "breaker-1", "variant_id": "c16", "quantity": 1}]
                        )
                    )
                )
                for _ in range(2)
            ),
            return_exceptions=True,
        )

    results = asyncio.run(race())
    assert sum(isinstance(r, dict) for r in results) == 1
    assert any(getattr(r, "status_code", None) == 409 for r in results)


def test_uploaded_images_protected_and_validated(client):
    assert client.post("/api/admin/images", content=b"bad").status_code == 401
    admin(client)
    assert client.post("/api/admin/images", content=b'<svg onload="alert(1)"/>').status_code == 422
    assert client.get("/api/media/invalid.png").status_code == 404


def test_stale_product_edit_cannot_overwrite_reserved_stock(client):
    admin(client)
    p = client.get("/api/admin/catalog").json()["products"][0]
    assert client.post("/api/orders", json=payload()).status_code == 201
    p["name"] = "Изменённое название"
    assert client.put("/api/admin/products/" + p["id"], json=p).status_code == 409
    updated = client.get("/api/catalog").json()["products"][0]
    assert next(v for v in updated["variants"] if v["id"] == "c16")["stock"] == 48


def test_notifications_format_full_long_orders_and_escape_html(client):
    from backend.app.notifications import telegram_parts, whatsapp_parts

    assert (
        client.post("/api/orders", json=payload(comment="<b>Без разметки</b>")).status_code == 201
    )
    admin(client)
    order = client.get("/api/admin/orders").json()[0]
    order["items"] = [
        {**order["items"][0], "name": f"Позиция {i}: " + ("Описание товара " * 8)}
        for i in range(50)
    ]
    telegram = telegram_parts(order)
    whatsapp = whatsapp_parts(order)
    assert len(telegram) > 1 and all(len(p) < 4000 for p in telegram)
    assert "https://wa.me/77000000000" in telegram[0]
    assert "&lt;b&gt;Без разметки&lt;/b&gt;" in "\n".join(telegram)
    assert "<b>Без разметки</b>" not in "\n".join(telegram)
    assert "Позиция 49" in "\n".join(telegram)
    assert len(whatsapp) > 1 and all(len(p) < 1024 for p in whatsapp)
    assert "Позиция 49" in " ".join(whatsapp)


def test_notification_retry_does_not_lose_order(client, monkeypatch):
    import httpx

    from backend.app import notifications

    order = client.post("/api/orders", json=payload()).json()
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "-100123")
    calls = []
    real_client = httpx.AsyncClient

    def handler(request):
        body = json.loads(request.content)
        calls.append(body)
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 1}})

    monkeypatch.setattr(
        notifications.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    asyncio.run(notifications.process_queue())
    admin(client)
    saved = client.get("/api/admin/orders").json()[0]
    assert saved["id"] == order["id"]
    assert next(n for n in saved["notifications"] if n["channel"] == "telegram")["status"] == "sent"
    assert (
        next(n for n in saved["notifications"] if n["channel"] == "whatsapp")["status"]
        == "unconfigured"
    )
    assert len(calls) == 1
    assert calls[0]["reply_markup"]["inline_keyboard"][0][0]["url"].startswith(
        "https://wa.me/77000000000"
    )
    asyncio.run(notifications.process_queue())
    assert len(calls) == 1


def test_analytics_uses_almaty_calendar_day_boundaries(client):
    from datetime import datetime, timedelta, timezone

    created = client.post("/api/orders", json=payload()).json()
    admin(client)
    for status in ["confirmed", "completed"]:
        client.patch("/api/admin/orders/" + created["id"], json={"status": status})
    local_midnight = datetime.now(timezone(timedelta(hours=5))).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    outside = (local_midnight - timedelta(days=6, seconds=1)).astimezone(timezone.utc).isoformat()

    async def move_order(value):
        async with connection() as db:
            await db.execute("UPDATE orders SET completed_at=? WHERE id=?", (value, created["id"]))

    asyncio.run(move_order(outside))
    assert client.get("/api/admin/analytics?days=7").json()["revenue"] == 0
    assert client.get("/api/admin/analytics?days=30").json()["revenue"] == 4080
    inside = (local_midnight - timedelta(days=6)).astimezone(timezone.utc).isoformat()
    asyncio.run(move_order(inside))
    stats = client.get("/api/admin/analytics?days=7").json()
    assert stats["revenue"] == sum(point["value"] for point in stats["series"]) == 4080


def test_notification_failure_is_retryable_without_recreating_order(client, monkeypatch):
    import httpx

    from backend.app import notifications

    order = client.post("/api/orders", json=payload()).json()
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "-100123")
    real_client = httpx.AsyncClient
    attempts = []

    def handler(request):
        attempts.append(request.url.path)
        return httpx.Response(500 if len(attempts) == 1 else 200, json={"ok": len(attempts) > 1})

    monkeypatch.setattr(
        notifications.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    asyncio.run(notifications.process_queue())
    admin(client)
    saved = client.get("/api/admin/orders").json()[0]
    assert (
        next(n for n in saved["notifications"] if n["channel"] == "telegram")["status"] == "failed"
    )
    assert client.post("/api/admin/orders/" + order["id"] + "/retry").status_code == 200
    asyncio.run(notifications.process_queue())
    orders = client.get("/api/admin/orders").json()
    assert len(orders) == 1
    assert (
        next(n for n in orders[0]["notifications"] if n["channel"] == "telegram")["status"]
        == "sent"
    )


def test_whatsapp_template_contains_order_and_uses_server_credentials(client, monkeypatch):
    import httpx

    from backend.app import notifications

    client.post("/api/orders", json=payload())
    for key, value in {
        "WHATSAPP_TOKEN": "test-token",
        "WHATSAPP_PHONE_ID": "12345",
        "WHATSAPP_TEMPLATE": "order_notice",
        "WHATSAPP_RECIPIENT": "77000000001",
    }.items():
        monkeypatch.setenv(key, value)
    real_client = httpx.AsyncClient
    messages = []

    def handler(request):
        messages.append(json.loads(request.content))
        assert request.headers["Authorization"] == "Bearer test-token"
        assert request.url.host == "graph.facebook.com"
        return httpx.Response(200, json={"messages": [{"id": "mock-message"}]})

    monkeypatch.setattr(
        notifications.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    asyncio.run(notifications.process_queue())
    assert messages[0]["to"] == "77000000001"
    assert messages[0]["template"]["name"] == "order_notice"
    summary = messages[0]["template"]["components"][0]["parameters"][0]["text"]
    assert "4080" in summary and "2040" in summary and "+77000000000" in summary
    admin(client)
    order = client.get("/api/admin/orders").json()[0]
    assert next(n for n in order["notifications"] if n["channel"] == "whatsapp")["status"] == "sent"


def test_password_change_requires_auth_old_password_and_revokes_sessions(client, monkeypatch):
    change = {
        "old_password": "test-password",
        "new_password": "SecureNext9!",
        "confirm_password": "SecureNext9!",
    }
    assert client.post("/api/admin/password", json=change).status_code == 401
    admin(client)
    first_token = client.cookies.get("kip_session")
    admin(client)
    second_token = client.cookies.get("kip_session")
    assert first_token != second_token
    wrong = client.post("/api/admin/password", json={**change, "old_password": "wrong"})
    assert wrong.status_code == 400
    assert client.get("/api/auth/me").status_code == 200
    response = client.post("/api/admin/password", json=change)
    assert response.status_code == 200
    assert "SecureNext9!" not in response.text
    assert not client.cookies.get("kip_session")
    for token in [first_token, second_token, "forged-token"]:
        client.cookies.set("kip_session", token)
        assert client.get("/api/admin/orders").status_code == 401
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"password": "test-password"}).status_code == 401
    # Persisted credentials take precedence over the bootstrap environment.
    monkeypatch.setenv("ADMIN_PASSWORD_HASH", "")
    assert client.post("/api/auth/login", json={"password": "SecureNext9!"}).status_code == 200


@pytest.mark.parametrize(
    "new_password", ["Ab1!", "lowercase1!", "NoNumbers!", "NoSymbol12", "Upper123 "]
)
def test_weak_password_rejected_on_server(client, new_password):
    admin(client)
    assert (
        client.post(
            "/api/admin/password",
            json={
                "old_password": "test-password",
                "new_password": new_password,
                "confirm_password": new_password,
            },
        ).status_code
        == 422
    )
    assert client.get("/api/auth/me").status_code == 200


def test_password_confirmation_and_bruteforce(client):
    admin(client)
    change = {
        "old_password": "wrong",
        "new_password": "StrongPass9!",
        "confirm_password": "StrongPass9!",
    }
    assert (
        client.post(
            "/api/admin/password", json={**change, "confirm_password": "Different1!"}
        ).status_code
        == 422
    )
    for _ in range(5):
        assert client.post("/api/admin/password", json=change).status_code == 400
    limited = client.post("/api/admin/password", json={**change, "old_password": "test-password"})
    assert limited.status_code == 429
    assert int(limited.headers["retry-after"]) > 0
    assert client.get("/api/auth/me").status_code == 200


def test_expired_lockout_allows_login(client):
    for _ in range(8):
        client.post("/api/auth/login", json={"password": "wrong"})
    blocked = client.post("/api/auth/login", json={"password": "test-password"})
    assert blocked.status_code == 429 and int(blocked.headers["retry-after"]) <= 900

    async def expire():
        async with connection() as db:
            await db.execute("UPDATE limits SET reset=0")

    asyncio.run(expire())
    admin(client)


def test_service_orders_do_not_reserve_or_restock_inventory(client):
    service = next(
        p for p in client.get("/api/catalog").json()["products"] if p["kind"] == "service"
    )
    body = payload(
        items=[
            {"product_id": service["id"], "variant_id": service["variants"][0]["id"], "quantity": 2}
        ]
    )
    result = client.post("/api/orders", json=body)
    assert result.status_code == 201
    assert result.json()["total"] == 30000
    admin(client)
    order = client.get("/api/admin/orders").json()[0]
    assert order["items"][0]["kind"] == "service"
    changed = {**service, "kind": "product"}
    assert client.put("/api/admin/products/" + service["id"], json=changed).status_code == 409
    assert (
        client.patch("/api/admin/orders/" + order["id"], json={"status": "cancelled"}).status_code
        == 200
    )
    current = next(
        p for p in client.get("/api/catalog").json()["products"] if p["id"] == service["id"]
    )
    assert current["variants"][0]["stock"] == 0
    fractional = {
        **body,
        "request_id": str(uuid4()),
        "items": [{**body["items"][0], "quantity": 1.5}],
    }
    assert client.post("/api/orders", json=fractional).status_code == 422


def test_service_crud_analytics_and_migration_once(client):
    from backend.app.database import initialize

    admin(client)
    p = next(
        p for p in client.get("/api/admin/catalog").json()["products"] if p["kind"] == "service"
    )
    created = {**p, "id": "new-service", "name": "Сборка щита для дома"}
    assert client.post("/api/admin/products", json=created).status_code == 201
    created = next(
        p for p in client.get("/api/admin/catalog").json()["products"] if p["id"] == "new-service"
    )
    created["variants"][0]["price"] = 20000
    assert client.put("/api/admin/products/new-service", json=created).status_code == 200
    order = client.post(
        "/api/orders",
        json=payload(
            items=[
                {"product_id": "new-service", "variant_id": p["variants"][0]["id"], "quantity": 1}
            ]
        ),
    ).json()
    for status in ["confirmed", "completed"]:
        assert (
            client.patch("/api/admin/orders/" + order["id"], json={"status": status}).status_code
            == 200
        )
    stats = client.get("/api/admin/analytics").json()
    assert stats["quantities"] == {"усл": 1}
    assert stats["revenue"] == 20000
    assert client.delete("/api/admin/products/" + p["id"]).status_code == 200
    asyncio.run(initialize())
    assert all(x["id"] != p["id"] for x in client.get("/api/catalog").json()["products"])


def test_message_templates_permissions_preview_save_and_order_snapshot(client):
    from backend.app.message_templates import MessageTemplates
    from backend.app.notifications import telegram_parts, whatsapp_parts

    templates = MessageTemplates().model_dump()
    assert client.get("/api/admin/message-templates").status_code == 401
    assert client.put("/api/admin/message-templates", json=templates).status_code == 401
    assert client.post("/api/admin/message-templates/preview", json=templates).status_code == 401
    admin(client)
    templates["telegram"] = "Новая заявка!\n" + templates["telegram"]
    templates["whatsapp"] = "Для менеджера\n" + templates["whatsapp"]
    templates["customer"] = "Здравствуйте, {имя}! Как оплатите заказ {номер_заказа}?"
    preview = client.post("/api/admin/message-templates/preview", json=templates)
    assert preview.status_code == 200 and "19800" in preview.json()["telegram"]
    assert client.get("/api/admin/orders").json() == []
    assert client.put("/api/admin/message-templates", json=templates).status_code == 200
    assert client.get("/api/admin/message-templates").json() == templates
    assert (
        client.post("/api/orders", json=payload(comment="<script>не HTML</script>")).status_code
        == 201
    )
    order = client.get("/api/admin/orders").json()[0]
    assert "Новая заявка!" in telegram_parts(order)[0]
    assert "Для менеджера" in whatsapp_parts(order)[0]
    assert "&lt;script&gt;" in telegram_parts(order)[0]
    assert "https://wa.me/77000000000" in telegram_parts(order)[0]
    templates["telegram"] = "Изменено\n" + templates["telegram"]
    templates["customer"] = "Добрый день, {имя}."
    client.put("/api/admin/message-templates", json=templates)
    updated = client.get("/api/admin/orders").json()[0]
    assert "Изменено" not in telegram_parts(updated)[0]
    from urllib.parse import unquote

    assert "Добрый день" in unquote(updated["whatsapp_url"])


@pytest.mark.parametrize(
    "template",
    ["{имя.__class__}", "{имя[0]}", "{имя!r}", "{имя:>9000}", "{неизвестно}", "{", "{имя}{имя}"],
)
def test_message_template_injection_rejected(client, template):
    from backend.app.message_templates import MessageTemplates

    admin(client)
    data = MessageTemplates().model_dump()
    data["customer"] = template
    assert client.put("/api/admin/message-templates", json=data).status_code == 422
    assert client.post("/api/admin/message-templates/preview", json=data).status_code == 422


def test_legacy_notification_text_keeps_original_format(client):
    from urllib.parse import unquote

    from backend.app.orders import order_text, whatsapp_customer

    client.post("/api/orders", json=payload())
    admin(client)
    order = client.get("/api/admin/orders").json()[0]
    order.pop("message_templates")
    assert "Итого за товары: 4080 ₸" in order_text(order)
    assert order_text(order).endswith("Комментарий: Тест")
    assert "4,080 ₸" in unquote(whatsapp_customer(order))
    order["comment"] = ""
    assert "Комментарий:" not in order_text(order)


def test_account_limit_applies_across_client_addresses(client):
    from backend.app.security import rate_limit

    async def fill_account_limit():
        for _ in range(40):
            await rate_limit("login:account", 40, 900)

    asyncio.run(fill_account_limit())
    response = client.post("/api/auth/login", json={"password": "test-password"})
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) > 0


@pytest.mark.parametrize("mode", [None, "false"])
def test_production_database_starts_without_demo_data(client, tmp_path, monkeypatch, mode):
    from backend.app.database import initialize, products, settings

    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "production.db"))
    if mode is None:
        monkeypatch.delenv("SEED_DEMO_DATA", raising=False)
    else:
        monkeypatch.setenv("SEED_DEMO_DATA", mode)

    async def inspect():
        await initialize()
        await initialize()
        async with connection() as db:
            assert await products(db) == []
            assert (await settings(db))["demo"] is False
            for table in ["orders", "sessions", "notifications", "admin_credentials"]:
                assert (await (await db.execute(f"SELECT COUNT(*) n FROM {table}")).fetchone())[
                    "n"
                ] == 0
            assert (await (await db.execute("SELECT COUNT(*) n FROM dictionaries")).fetchone())[
                "n"
            ] > 0

    asyncio.run(inspect())


def test_seed_flag_does_not_delete_existing_products(client, monkeypatch):
    from backend.app.database import initialize

    assert len(client.get("/api/catalog").json()["products"]) == 9
    monkeypatch.setenv("SEED_DEMO_DATA", "false")
    asyncio.run(initialize())
    assert len(client.get("/api/catalog").json()["products"]) == 9
