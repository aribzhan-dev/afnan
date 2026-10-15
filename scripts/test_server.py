import hashlib
import os
import sys
import tempfile
from pathlib import Path

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
salt = "e2e-salt"
os.environ["ADMIN_PASSWORD_HASH"] = (
    salt + ":" + hashlib.pbkdf2_hmac("sha256", b"test-password", salt.encode(), 600_000).hex()
)
os.environ["ALLOWED_ORIGINS"] = "http://127.0.0.1:8001"
os.environ["COOKIE_SECURE"] = "false"
os.environ["SEED_DEMO_DATA"] = "true"
for key in [
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "WHATSAPP_TOKEN",
    "WHATSAPP_PHONE_ID",
    "WHATSAPP_TEMPLATE",
]:
    os.environ[key] = ""
with tempfile.TemporaryDirectory(prefix="kip-e2e-") as directory:
    os.environ["DATABASE_PATH"] = str(Path(directory) / "store.db")
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8001, log_level="warning")
