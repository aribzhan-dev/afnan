import re
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Model(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class Variant(Model):
    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")
    label: str = Field(min_length=1, max_length=100)
    price: int = Field(gt=0, le=100_000_000)
    stock: float = Field(ge=0, le=1_000_000, multiple_of=0.001, allow_inf_nan=False)


class Product(Model):
    kind: Literal["product", "service"] = "product"
    version: int = Field(default=0, ge=0)
    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")
    name: str = Field(min_length=3, max_length=150)
    category: str = Field(min_length=1, max_length=80)
    brand: str = Field(max_length=60)
    description: str = Field(min_length=10, max_length=5000)
    unit: str = Field(min_length=1, max_length=30)
    step: float = Field(gt=0, le=1000, multiple_of=0.001, allow_inf_nan=False)
    image: str = Field(max_length=500)
    discount_enabled: bool = False
    discount_percent: int = Field(default=0, ge=0, le=90)
    featured: bool = False
    active: bool = True
    specs: dict[str, str] = Field(default_factory=dict, max_length=20)
    variants: list[Variant] = Field(min_length=1, max_length=100)

    @field_validator("image")
    @classmethod
    def safe_image(cls, value: str) -> str:
        if not re.fullmatch(
            r"(?:/products/[a-zA-Z0-9_-]+\.(?:svg|png|webp|jpg|jpeg)|/api/media/[a-f0-9]{32}\.(?:png|jpg|webp))",
            value,
        ):
            raise ValueError("Выберите изображение из каталога")
        return value

    @model_validator(mode="after")
    def unique_variants(self):
        if len({v.id for v in self.variants}) != len(self.variants):
            raise ValueError("Артикулы вариантов должны быть уникальными")
        if any(len(k) > 80 or len(v) > 200 for k, v in self.specs.items()):
            raise ValueError("Слишком длинная характеристика")
        if self.kind == "service" and (self.step != 1 or self.unit != "усл"):
            raise ValueError("Услуги продаются целыми единицами с обозначением усл")
        if self.unit == "шт" and self.step != 1:
            raise ValueError("Товары в штуках продаются целыми единицами")
        if any(
            abs(v.stock / self.step - round(v.stock / self.step)) > 0.00001 for v in self.variants
        ):
            raise ValueError("Остаток должен соответствовать шагу продажи")
        return self


class CartItem(Model):
    product_id: str = Field(max_length=80)
    variant_id: str = Field(max_length=80)
    quantity: float = Field(gt=0, le=100_000, multiple_of=0.001, allow_inf_nan=False)


class Checkout(Model):
    request_id: UUID
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(pattern=r"^\+7[67]\d{9}$")
    delivery: Literal["pickup", "delivery"]
    city: str = Field(default="Шымкент", min_length=2, max_length=80)
    address: str = Field(default="", max_length=300)
    comment: str = Field(default="", max_length=500)
    consent: Literal[True]
    items: list[CartItem] = Field(min_length=1, max_length=50)

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        if not all(c.isalpha() or c in " '-’" for c in value) or not any(
            c.isalpha() for c in value
        ):
            raise ValueError("Имя должно содержать только буквы, пробелы и дефисы")
        return value

    @model_validator(mode="after")
    def delivery_address(self):
        if self.delivery == "delivery" and len(self.address) < 5:
            raise ValueError("Укажите адрес доставки")
        keys = [(x.product_id, x.variant_id) for x in self.items]
        if len(keys) != len(set(keys)):
            raise ValueError("Объедините одинаковые товары в корзине")
        return self


class Login(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: str = Field(min_length=1, max_length=200)


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    old_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)
    confirm_password: str = Field(min_length=8, max_length=200)

    @model_validator(mode="after")
    def strong_password(self):
        value = self.new_password
        if not (
            any(c.isupper() for c in value)
            and any(c in "0123456789" for c in value)
            and any(not c.isalnum() and not c.isspace() for c in value)
        ):
            raise ValueError(
                "Пароль: минимум 8 символов, одна заглавная буква, цифра и специальный символ"
            )
        if value != self.confirm_password:
            raise ValueError("Пароли не совпадают")
        return self


class OrderStatus(Model):
    status: Literal["new", "confirmed", "completed", "cancelled"]


class DictionaryItem(Model):
    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=80)
    symbol: str = Field(default="", max_length=20)
    kind: Literal["sale", "spec"] = "sale"


class Settings(Model):
    demo: bool = True
    phone: str = Field(pattern=r"^\+7[67]\d{9}$")
    address: str = Field(min_length=5, max_length=250)
    hours: str = Field(min_length=3, max_length=120)
    about: str = Field(min_length=20, max_length=2000)
    delivery_note: str = Field(min_length=10, max_length=500)
