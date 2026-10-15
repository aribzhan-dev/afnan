import asyncio
import hashlib
import hmac
import math
import os
import secrets
import time

from fastapi import HTTPException, Request

from .database import connection


async def rate_limit(key: str, count: int, seconds: int) -> None:
    now = time.time()
    async with connection() as db:
        await db.execute("BEGIN IMMEDIATE")
        await db.execute("DELETE FROM limits WHERE reset <= ?", (now,))
        row = await (
            await db.execute("SELECT count,reset FROM limits WHERE key=?", (key,))
        ).fetchone()
        if row and row["count"] >= count:
            raise HTTPException(
                429,
                "Слишком много попыток. Попробуйте позже.",
                headers={"Retry-After": str(max(1, math.ceil(row["reset"] - now)))},
            )
        await db.execute(
            "INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
            (key, now + seconds),
        )


async def password_hash(db) -> str:
    row = await (
        await db.execute("SELECT password_hash FROM admin_credentials WHERE id=1")
    ).fetchone()
    stored = row["password_hash"] if row else os.getenv("ADMIN_PASSWORD_HASH", "")
    if ":" not in stored:
        raise HTTPException(503, "Сначала настройте пароль администратора")
    return stored


async def matches(password: str, stored: str) -> bool:
    salt, expected = stored.split(":", 1)
    actual = await asyncio.to_thread(
        hashlib.pbkdf2_hmac, "sha256", password.encode(), salt.encode(), 600_000
    )
    return hmac.compare_digest(actual.hex(), expected)


async def hash_password(password: str) -> str:
    salt = secrets.token_hex(32)
    value = await asyncio.to_thread(
        hashlib.pbkdf2_hmac, "sha256", password.encode(), salt.encode(), 600_000
    )
    return salt + ":" + value.hex()


def session_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def login_session(password: str) -> str:
    async with connection() as db:
        stored = await password_hash(db)
    if not await matches(password, stored):
        raise HTTPException(401, "Неверный пароль")
    token = secrets.token_urlsafe(48)
    async with connection() as db:
        await db.execute("BEGIN IMMEDIATE")
        if not hmac.compare_digest(stored, await password_hash(db)):
            raise HTTPException(401, "Пароль изменился. Войдите снова")
        await db.execute("DELETE FROM sessions WHERE expires < ?", (time.time(),))
        await db.execute(
            "INSERT INTO sessions VALUES(?,?)", (session_hash(token), time.time() + 28800)
        )
    return token


async def change_password(old: str, new: str, token: str) -> None:
    async with connection() as db:
        stored = await password_hash(db)
    if not await matches(old, stored):
        raise HTTPException(400, "Старый пароль указан неверно")
    if old == new:
        raise HTTPException(422, "Новый пароль должен отличаться от старого")
    updated = await hash_password(new)
    async with connection() as db:
        await db.execute("BEGIN IMMEDIATE")
        await check_session(db, token)
        if not hmac.compare_digest(stored, await password_hash(db)):
            raise HTTPException(409, "Пароль уже изменён. Войдите снова")
        await db.execute(
            "INSERT INTO admin_credentials VALUES(1,?) ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash",
            (updated,),
        )
        await db.execute("DELETE FROM sessions")


async def check_session(db, token: str) -> None:
    row = await (
        await db.execute(
            "SELECT 1 FROM sessions WHERE token=? AND expires>?", (session_hash(token), time.time())
        )
    ).fetchone()
    if not row:
        raise HTTPException(401, "Войдите в панель управления")


async def require_admin(request: Request) -> None:
    async with connection() as db:
        await check_session(db, request.cookies.get("kip_session", ""))
