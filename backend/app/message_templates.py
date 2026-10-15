import json
from string import Formatter
from urllib.parse import quote

from pydantic import BaseModel, ConfigDict, Field, field_validator

DEFAULT_ORDER = "Заказ №{номер_заказа} · {магазин}\nКлиент: {имя}\nТелефон: {телефон}\n{состав_заказа}\nИтого: {сумма} ₸\nПолучение: {получение}\nКомментарий: {комментарий}\nДоставка и оплата согласуются с менеджером."
DEFAULT_CUSTOMER = "Здравствуйте, {имя}! Рады видеть вас в нашем магазине «{магазин}». Ваш заказ №{номер_заказа} на сумму {сумма} ₸ принят. Как вам будет удобно оплатить: наличными, переводом или по QR-коду?"
FIELDS = {
    "номер_заказа",
    "магазин",
    "имя",
    "телефон",
    "состав_заказа",
    "сумма",
    "получение",
    "комментарий",
}
REQUIRED = {"номер_заказа", "имя", "телефон", "состав_заказа", "сумма", "получение"}


class MessageTemplates(BaseModel):
    model_config = ConfigDict(extra="forbid")
    telegram: str = Field(default=DEFAULT_ORDER, min_length=1, max_length=2000)
    whatsapp: str = Field(default=DEFAULT_ORDER, min_length=1, max_length=2000)
    customer: str = Field(default=DEFAULT_CUSTOMER, min_length=1, max_length=600)

    @field_validator("telegram", "whatsapp", "customer")
    @classmethod
    def valid_template(cls, value, info):
        if not value.strip():
            raise ValueError("Введите текст сообщения")
        try:
            parts = list(Formatter().parse(value))
        except ValueError:
            raise ValueError("Проверьте парные фигурные скобки в шаблоне") from None
        names = []
        for _, name, spec, conversion in parts:
            if name is not None:
                if name not in FIELDS or spec or conversion:
                    raise ValueError(
                        "Используйте только перечисленные переменные без форматирования"
                    )
                names.append(name)
        if len(names) != len(set(names)):
            raise ValueError("Каждую переменную можно использовать только один раз")
        if info.field_name != "customer" and not REQUIRED.issubset(names):
            raise ValueError("Сохраните обязательные данные заказа в шаблоне")
        if info.field_name == "customer" and "состав_заказа" in names:
            raise ValueError("Для короткого сообщения клиенту используйте номер и сумму заказа")
        return value


async def load_templates(db) -> dict:
    row = await (await db.execute("SELECT data FROM notification_templates WHERE id=1")).fetchone()
    return (
        MessageTemplates(**json.loads(row["data"])).model_dump()
        if row
        else MessageTemplates().model_dump()
    )


def render(order: dict, channel: str, templates: dict | None = None) -> str:
    if not templates and not order.get("message_templates"):
        return legacy_render(order, channel)
    templates = templates or order["message_templates"]
    items = "\n".join(
        f"{i['name']} · {i['variant_label']}\n{i['unit_price']} ₸ × {i['quantity']:g} {i['unit']} = {i['total']} ₸"
        for i in order["items"]
    )
    values = {
        "номер_заказа": order["id"],
        "магазин": "КИП и А",
        "имя": order["name"],
        "телефон": order["phone"],
        "состав_заказа": items,
        "сумма": str(order["total"]),
        "получение": "Самовывоз"
        if order["delivery"] == "pickup"
        else f"{order['city']}, {order['address']}",
        "комментарий": order["comment"] or "—",
    }
    return templates[channel].format_map(values)


def customer_url(order: dict, templates: dict | None = None) -> str:
    return f"https://wa.me/{order['phone'].lstrip('+')}?text={quote(render(order, 'customer', templates))}"


def preview(templates: MessageTemplates) -> dict:
    sample = {
        "id": "ПРИМЕР-001",
        "name": "Александр",
        "phone": "+77000000000",
        "delivery": "delivery",
        "city": "Шымкент",
        "address": "ул. Примерная, 10",
        "comment": "Позвонить перед доставкой",
        "total": 19800,
        "items": [
            {
                "name": "Автомат 1P",
                "variant_label": "16 А",
                "unit_price": 2400,
                "quantity": 2,
                "unit": "шт",
                "total": 4800,
            },
            {
                "name": "Сборка электрощита",
                "variant_label": "По согласованной схеме",
                "unit_price": 15000,
                "quantity": 1,
                "unit": "усл",
                "total": 15000,
            },
        ],
    }
    return {
        key: render(sample, key, templates.model_dump())
        for key in ["telegram", "whatsapp", "customer"]
    }


def legacy_render(order: dict, channel: str) -> str:
    # Preserve chunk boundaries for notifications queued before template support.
    if channel == "customer":
        return f"Здравствуйте, {order['name']}! Рады видеть вас в нашем магазине «КИП и А». Ваш заказ №{order['id']} на сумму {order['total']:,} ₸ принят. Как вам будет удобно оплатить: наличными, переводом или по QR-коду?"
    lines = [
        f"Заказ №{order['id']} · КИП и А",
        f"Клиент: {order['name']}",
        f"Телефон: {order['phone']}",
    ]
    for item in order["items"]:
        lines.append(
            f"{item['name']} · {item['variant_label']}\n{item['unit_price']} ₸ × {item['quantity']:g} {item['unit']} = {item['total']} ₸"
        )
    lines.extend(
        [
            f"Итого за товары: {order['total']} ₸",
            "Получение: "
            + (
                "Самовывоз"
                if order["delivery"] == "pickup"
                else f"{order['city']}, {order['address']}"
            ),
            "Доставка и оплата согласуются с менеджером.",
        ]
    )
    if order["comment"]:
        lines.append("Комментарий: " + order["comment"])
    return "\n".join(lines)
