import hashlib
import secrets
from pathlib import Path

root = Path(__file__).resolve().parents[1]
env = root / ".env"
if env.exists():
    print("Файл .env уже существует. Настройки сохранены.")
else:
    password = secrets.token_urlsafe(15) + "A7!"
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 600_000).hex()
    env.write_text(
        f"ADMIN_PASSWORD_HASH={salt}:{digest}\nCOOKIE_SECURE=false\nSEED_DEMO_DATA=false\nALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8000\nTELEGRAM_BOT_TOKEN=\nTELEGRAM_CHAT_ID=\nWHATSAPP_TOKEN=\nWHATSAPP_PHONE_ID=\nWHATSAPP_TEMPLATE=\nWHATSAPP_RECIPIENT=77079565657\nWHATSAPP_API_VERSION=v23.0\nWHATSAPP_TEMPLATE_LANGUAGE=ru\n"
    )
    env.chmod(0o600)
    access = root / "admin-access.txt"
    access.write_text(
        f"Адрес: http://127.0.0.1:8000/admin\nПароль: {password}\nУдалите этот файл после сохранения пароля в менеджере паролей.\n"
    )
    access.chmod(0o600)
    print("Настройки созданы. Данные входа: admin-access.txt")
