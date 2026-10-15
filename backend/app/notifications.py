import asyncio
import html
import json
import logging
import os
import time

import httpx

from .database import connection
from .orders import order_text, whatsapp_customer

logger = logging.getLogger(__name__)


def telegram_parts(order: dict) -> list[str]:
    lines = [html.escape(line) for line in order_text(order).splitlines()]
    link = f'<a href="{html.escape(whatsapp_customer(order), quote=True)}">{order["phone"]}</a>'
    lines = [
        line.replace(html.escape(order["phone"]), link, 1) if order["phone"] in line else line
        for line in lines
    ]
    parts: list[str] = []
    current = ""
    for line in lines:
        if len(current) + len(line) + 1 > 3000 and current:
            parts.append(current)
            current = ""
        current += ("\n" if current else "") + line
    if current:
        parts.append(current)
    return parts


def whatsapp_parts(order: dict) -> list[str]:
    text = " ".join(order_text(order, "whatsapp").split())
    chunks: list[str] = []
    while text:
        boundary = text.rfind(" ", 0, 850) if len(text) > 850 else len(text)
        if boundary <= 0:
            boundary = 850
        chunks.append(text[:boundary])
        text = text[boundary:].lstrip()
    return [f"{order['id']} · {i + 1}/{len(chunks)} · {part}" for i, part in enumerate(chunks)]


async def deliver(channel: str, order: dict, sent_parts: int = 0) -> str:
    async with httpx.AsyncClient(timeout=15) as client:
        if channel == "telegram":
            token, chat = os.getenv("TELEGRAM_BOT_TOKEN"), os.getenv("TELEGRAM_CHAT_ID")
            if not token or not chat:
                return "unconfigured"
            parts = telegram_parts(order)
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            messages = [
                {
                    "chat_id": chat,
                    "text": text,
                    "parse_mode": "HTML",
                    "link_preview_options": {"is_disabled": True},
                    "reply_markup": {
                        "inline_keyboard": [
                            [
                                {
                                    "text": "Написать клиенту в WhatsApp",
                                    "url": whatsapp_customer(order),
                                }
                            ]
                        ]
                    },
                }
                for text in parts
            ]
            headers = {}
        else:
            token, phone, template, recipient = [
                os.getenv(k)
                for k in [
                    "WHATSAPP_TOKEN",
                    "WHATSAPP_PHONE_ID",
                    "WHATSAPP_TEMPLATE",
                    "WHATSAPP_RECIPIENT",
                ]
            ]
            if not all([token, phone, template, recipient]):
                return "unconfigured"
            url = f"https://graph.facebook.com/{os.getenv('WHATSAPP_API_VERSION', 'v23.0')}/{phone}/messages"
            headers = {"Authorization": f"Bearer {token}"}
            messages = [
                {
                    "messaging_product": "whatsapp",
                    "to": recipient,
                    "type": "template",
                    "template": {
                        "name": template,
                        "language": {"code": os.getenv("WHATSAPP_TEMPLATE_LANGUAGE", "ru")},
                        "components": [
                            {"type": "body", "parameters": [{"type": "text", "text": part}]}
                        ],
                    },
                }
                for part in whatsapp_parts(order)
            ]
        for index, message in enumerate(messages):
            if index < sent_parts:
                continue
            response = await client.post(url, headers=headers, json=message)
            body = response.json()
            if (
                not response.is_success
                or (channel == "telegram" and not body.get("ok"))
                or (channel == "whatsapp" and not body.get("messages"))
            ):
                raise RuntimeError("Сервис отклонил уведомление")
            async with connection() as db:
                await db.execute(
                    "UPDATE notifications SET sent_parts=?,retry_at=? WHERE order_id=? AND channel=?",
                    (index + 1, time.time() + 120, order["id"], channel),
                )
    return "sent"


async def process_queue() -> None:
    while True:
        async with connection() as db:
            await db.execute("BEGIN IMMEDIATE")
            row = await (
                await db.execute(
                    "SELECT n.*,o.data FROM notifications n JOIN orders o ON o.id=n.order_id WHERE n.status IN ('pending','failed','sending') AND n.retry_at<=? AND n.attempts<5 ORDER BY o.created_at LIMIT 1",
                    (time.time(),),
                )
            ).fetchone()
            if not row:
                return
            await db.execute(
                "UPDATE notifications SET status='sending',attempts=attempts+1,retry_at=? WHERE order_id=? AND channel=?",
                (time.time() + 120, row["order_id"], row["channel"]),
            )
        status, error = "failed", ""
        try:
            status = await deliver(row["channel"], json.loads(row["data"]), row["sent_parts"])
        except Exception:
            error = "Не удалось отправить. Проверьте настройки и доступность сервиса."
        async with connection() as db:
            await db.execute(
                "UPDATE notifications SET status=?,error=?,retry_at=? WHERE order_id=? AND channel=?",
                (
                    status,
                    error,
                    time.time() + min(3600, 30 * 2 ** row["attempts"]),
                    row["order_id"],
                    row["channel"],
                ),
            )


async def worker() -> None:
    while True:
        try:
            await process_queue()
        except Exception:
            logger.error("Ошибка обработки очереди уведомлений")
        await asyncio.sleep(30)
