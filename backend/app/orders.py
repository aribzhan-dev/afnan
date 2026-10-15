import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from urllib.parse import quote

from fastapi import HTTPException

from .database import connection, products, save_product, settings
from .message_templates import customer_url, load_templates, render
from .schemas import Checkout


def price_for(product: dict, variant: dict) -> int:
    discount = product["discount_percent"] if product["discount_enabled"] else 0
    return int(
        (Decimal(variant["price"]) * (100 - discount) / 100).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )


def whatsapp_customer(order: dict, templates: dict | None = None) -> str:
    return customer_url(order, templates)


def order_text(order: dict, channel: str = "telegram") -> str:
    return render(order, channel)


async def create_order(payload: Checkout) -> dict:
    body = payload.model_dump(mode="json")
    fingerprint = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
    async with connection() as db:
        await db.execute("BEGIN IMMEDIATE")
        existing = await (
            await db.execute(
                "SELECT data,fingerprint FROM orders WHERE request_id=?", (str(payload.request_id),)
            )
        ).fetchone()
        if existing:
            if existing["fingerprint"] != fingerprint:
                raise HTTPException(
                    409, "Состав заказа изменился. Обновите страницу и повторите оформление."
                )
            order = json.loads(existing["data"])
        else:
            catalog = {p["id"]: p for p in await products(db)}
            items = []
            for item in payload.items:
                p = catalog.get(item.product_id)
                if not p or not p["active"]:
                    raise HTTPException(409, "Товар больше не доступен. Обновите корзину.")
                variant = next((v for v in p["variants"] if v["id"] == item.variant_id), None)
                if not variant or (p.get("kind") != "service" and variant["stock"] < item.quantity):
                    raise HTTPException(409, f"Недостаточно товара: {p['name']}")
                count = Decimal(str(item.quantity)) / Decimal(str(p["step"]))
                if count != count.to_integral_value():
                    raise HTTPException(422, f"Шаг продажи: {p['step']} {p['unit']}")
                unit_price = price_for(p, variant)
                total = int(
                    (Decimal(unit_price) * Decimal(str(item.quantity))).quantize(
                        Decimal("1"), rounding=ROUND_HALF_UP
                    )
                )
                items.append(
                    {
                        "product_id": p["id"],
                        "kind": p.get("kind", "product"),
                        "variant_id": variant["id"],
                        "name": p["name"],
                        "variant_label": variant["label"],
                        "unit": p["unit"],
                        "quantity": item.quantity,
                        "unit_price": unit_price,
                        "total": total,
                    }
                )
                if p.get("kind") != "service":
                    variant["stock"] = round(variant["stock"] - item.quantity, 4)
                    await save_product(db, p)
            now = datetime.now(timezone.utc).isoformat()
            order = {
                **{k: body[k] for k in ["name", "phone", "delivery", "city", "address", "comment"]},
                "id": "K-" + secrets.token_hex(8).upper(),
                "items": items,
                "total": sum(i["total"] for i in items),
                "created_at": now,
                "message_templates": await load_templates(db),
                "status": "new",
            }
            await db.execute(
                "INSERT INTO orders VALUES(?,?,?,?,?,NULL,?)",
                (
                    order["id"],
                    str(payload.request_id),
                    fingerprint,
                    "new",
                    now,
                    json.dumps(order, ensure_ascii=False),
                ),
            )
            await db.executemany(
                "INSERT INTO notifications(order_id,channel) VALUES(?,?)",
                [(order["id"], c) for c in ["telegram", "whatsapp"]],
            )
        shop = await settings(db)
        return {
            "id": order["id"],
            "total": order["total"],
            "whatsapp_url": f"https://wa.me/{shop['phone'].lstrip('+')}?text={quote(order_text(order, 'whatsapp'))}",
        }


async def list_orders() -> list[dict]:
    async with connection() as db:
        rows = await (
            await db.execute("SELECT * FROM orders ORDER BY created_at DESC LIMIT 1000")
        ).fetchall()
        notifications = await (
            await db.execute("SELECT order_id,channel,status,attempts,error FROM notifications")
        ).fetchall()
        notification_map: dict[str, list] = {}
        for notification in notifications:
            notification_map.setdefault(notification["order_id"], []).append(
                {k: notification[k] for k in ["channel", "status", "attempts", "error"]}
            )
        templates = await load_templates(db)
        result = []
        for row in rows:
            order = {
                **json.loads(row["data"]),
                "status": row["status"],
                "completed_at": row["completed_at"],
            }
            order["whatsapp_url"] = whatsapp_customer(order, templates)
            order["notifications"] = notification_map.get(order["id"], [])
            result.append(order)
        return result


async def change_status(order_id: str, status: str) -> None:
    async with connection() as db:
        await db.execute("BEGIN IMMEDIATE")
        row = await (await db.execute("SELECT * FROM orders WHERE id=?", (order_id,))).fetchone()
        if not row:
            raise HTTPException(404, "Заказ не найден")
        if status == row["status"]:
            return
        transitions = {
            "new": {"confirmed", "cancelled"},
            "confirmed": {"completed", "cancelled"},
            "completed": set(),
            "cancelled": set(),
        }
        if status not in transitions[row["status"]]:
            raise HTTPException(409, "Этот переход статуса недоступен")
        if status == "cancelled":
            catalog = {p["id"]: p for p in await products(db)}
            for item in json.loads(row["data"])["items"]:
                if item.get("kind") == "service":
                    continue
                p = catalog.get(item["product_id"])
                if p:
                    v = next((v for v in p["variants"] if v["id"] == item["variant_id"]), None)
                    if v:
                        v["stock"] = round(v["stock"] + item["quantity"], 4)
                        await save_product(db, p)
        await db.execute(
            "UPDATE orders SET status=?,completed_at=? WHERE id=?",
            (
                status,
                datetime.now(timezone.utc).isoformat() if status == "completed" else None,
                order_id,
            ),
        )


async def analytics(days: int) -> dict:
    local_now = datetime.now(timezone(timedelta(hours=5)))
    cutoff = (
        (local_now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1))
        .astimezone(timezone.utc)
        .isoformat()
    )
    async with connection() as db:
        rows = await (
            await db.execute(
                "SELECT data,completed_at FROM orders WHERE status='completed' AND completed_at>=?",
                (cutoff,),
            )
        ).fetchall()
        active = (
            await (
                await db.execute(
                    "SELECT count(*) n FROM orders WHERE status IN ('new','confirmed')"
                )
            ).fetchone()
        )["n"]
    revenue = 0
    quantities: dict[str, float] = {}
    ranking: dict[str, dict] = {}
    daily: dict[str, int] = {}
    for row in rows:
        order = json.loads(row["data"])
        revenue += order["total"]
        date = (
            datetime.fromisoformat(row["completed_at"])
            .astimezone(timezone(timedelta(hours=5)))
            .date()
            .isoformat()
        )
        daily[date] = daily.get(date, 0) + order["total"]
        for item in order["items"]:
            quantities[item["unit"]] = round(quantities.get(item["unit"], 0) + item["quantity"], 4)
            key = item["product_id"]
            if key not in ranking:
                ranking[key] = {
                    "id": key,
                    "name": item["name"],
                    "quantity": 0,
                    "revenue": 0,
                    "unit": item["unit"],
                }
            ranking[key]["quantity"] = round(ranking[key]["quantity"] + item["quantity"], 4)
            ranking[key]["revenue"] += item["total"]
    today = datetime.now(timezone(timedelta(hours=5))).date()
    series = [
        {
            "date": (today - timedelta(days=i)).isoformat(),
            "value": daily.get((today - timedelta(days=i)).isoformat(), 0),
        }
        for i in reversed(range(days))
    ]
    return {
        "revenue": revenue,
        "orders": len(rows),
        "active": active,
        "quantities": quantities,
        "top": sorted(ranking.values(), key=lambda x: x["revenue"], reverse=True)[:5],
        "series": series,
    }
