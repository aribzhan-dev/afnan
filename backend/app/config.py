import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
DB_PATH = os.getenv("DATABASE_PATH", str(ROOT / "data/store.db"))
ORIGINS = set(
    os.getenv(
        "ALLOWED_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8000"
    ).split(",")
)
SECURE_COOKIE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
