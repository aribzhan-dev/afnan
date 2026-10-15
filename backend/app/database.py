import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import aiosqlite

from . import config
from .seed import CATEGORIES, PRODUCTS, SETTINGS, UNITS


@asynccontextmanager
async def connection():
    async with aiosqlite.connect(config.DB_PATH, timeout=15) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys=ON")
        try:
            yield db
            await db.commit()
        except BaseException:
            await db.rollback()
            raise


async def initialize() -> None:
    Path(config.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    async with connection() as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.executescript("""
        CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS dictionaries(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));
        CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,request_id TEXT UNIQUE NOT NULL,fingerprint TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,completed_at TEXT,data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS notifications(order_id TEXT NOT NULL,channel TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '',retry_at REAL NOT NULL DEFAULT 0,PRIMARY KEY(order_id,channel),FOREIGN KEY(order_id) REFERENCES orders(id));
        CREATE TABLE IF NOT EXISTS admin_credentials(id INTEGER PRIMARY KEY CHECK(id=1),password_hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS notification_templates(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at);
        """)
        columns = await (await db.execute("PRAGMA table_info(notifications)")).fetchall()
        if "sent_parts" not in [row["name"] for row in columns]:
            await db.execute(
                "ALTER TABLE notifications ADD COLUMN sent_parts INTEGER NOT NULL DEFAULT 0"
            )
        existing = await (await db.execute("SELECT 1 FROM settings")).fetchone()
        if not existing:
            seed_demo = os.getenv("SEED_DEMO_DATA", "false").lower() == "true"
            initial_settings = {**SETTINGS, "demo": seed_demo}
            await db.execute(
                "INSERT INTO settings VALUES(1,?)",
                (json.dumps(initial_settings, ensure_ascii=False),),
            )
            for kind, items in [("categories", CATEGORIES), ("units", UNITS)]:
                await db.executemany(
                    "INSERT INTO dictionaries VALUES(?,?,?)",
                    [(kind, p["id"], json.dumps(p, ensure_ascii=False)) for p in items],
                )
            await db.executemany(
                "INSERT INTO products VALUES(?,?)",
                [
                    (p["id"], json.dumps(p, ensure_ascii=False))
                    for p in (PRODUCTS if seed_demo else [])
                ],
            )

        if not await (
            await db.execute("SELECT 1 FROM migrations WHERE name='services-v1'")
        ).fetchone():
            await db.execute(
                "INSERT OR IGNORE INTO dictionaries VALUES('categories','services',?)",
                (json.dumps({"id": "services", "name": "Услуги"}, ensure_ascii=False),),
            )
            await db.execute(
                "INSERT OR IGNORE INTO dictionaries VALUES('units','service',?)",
                (
                    json.dumps(
                        {"id": "service", "name": "Услуга", "symbol": "усл", "kind": "sale"},
                        ensure_ascii=False,
                    ),
                ),
            )
            if (await settings(db)).get("demo", False):
                service = {
                    "id": "panel-assembly",
                    "kind": "service",
                    "name": "Сборка электрощита",
                    "category": "services",
                    "brand": "КИП и А",
                    "description": "Соберём электрощит для квартиры, дома или коммерческого помещения. Подберём защиту и автоматику, согласуем схему и состав работ. Комплектующие оплачиваются отдельно. Демонстрационная цена — уточните стоимость вашего проекта у менеджера.",
                    "unit": "усл",
                    "step": 1,
                    "image": "/products/panel.svg",
                    "discount_enabled": False,
                    "discount_percent": 0,
                    "featured": False,
                    "active": True,
                    "specs": {"Комплектующие": "Оплачиваются отдельно", "Срок": "По согласованию"},
                    "variants": [
                        {
                            "id": "assembly-base",
                            "label": "Сборка по согласованной схеме",
                            "price": 15000,
                            "stock": 0,
                        }
                    ],
                }
                await db.execute(
                    "INSERT OR IGNORE INTO products VALUES(?,?)",
                    (service["id"], json.dumps(service, ensure_ascii=False)),
                )
            await db.execute("INSERT INTO migrations VALUES('services-v1')")


async def products(db) -> list[dict]:
    return [
        {"kind": "product", **json.loads(r["data"])}
        for r in await (await db.execute("SELECT data FROM products ORDER BY rowid")).fetchall()
    ]


async def settings(db) -> dict:
    return json.loads(
        (await (await db.execute("SELECT data FROM settings WHERE id=1")).fetchone())["data"]
    )


async def dictionary(db, kind: str) -> list[dict]:
    return [
        json.loads(r["data"])
        for r in await (
            await db.execute("SELECT data FROM dictionaries WHERE kind=? ORDER BY rowid", (kind,))
        ).fetchall()
    ]


async def save_product(db, p: dict) -> None:
    p["version"] = p.get("version", 0) + 1
    await db.execute(
        "INSERT INTO products VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
        (p["id"], json.dumps(p, ensure_ascii=False)),
    )
