import asyncio
import os
from pathlib import Path
from telethon import TelegramClient

def _load_env():
    base = Path(__file__).resolve().parent
    for candidate in (base.parent / ".env", base / ".env"):
        if candidate.is_file():
            try:
                for line in candidate.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    k, v = k.strip(), v.strip().strip('"\'')
                    if k and k not in os.environ:
                        os.environ[k] = v
            except Exception:
                pass
            break

_load_env()

API_ID = int(os.getenv("TG_API_ID", "0"))
API_HASH = os.getenv("TG_API_HASH", "")
SESSION_NAME = "nigroserver_session"
BOT_TOKEN = os.getenv("TG_BOT_TOKEN", "")

if not API_ID or not API_HASH or not BOT_TOKEN:
    raise RuntimeError("Faltan credenciales: define TG_API_ID, TG_API_HASH y TG_BOT_TOKEN en el archivo .env")

# Inicialización directa del bot
client = TelegramClient(SESSION_NAME, API_ID, API_HASH).start(bot_token=BOT_TOKEN)

async def main():
    me = await client.get_me()
    print(f"¡Conexión exitosa! Autenticado como el bot: @{me.username}")

with client:
    client.loop.run_until_complete(main())