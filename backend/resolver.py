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
BOT_TOKEN = os.getenv("TG_BOT_TOKEN", "")
SESSION_NAME = "nigroserver_session"

if not API_ID or not API_HASH or not BOT_TOKEN:
    raise RuntimeError("Faltan credenciales: define TG_API_ID, TG_API_HASH y TG_BOT_TOKEN en el archivo .env")

# Inicializamos directamente con el bot token para evitar que pida teléfono
client = TelegramClient(SESSION_NAME, API_ID, API_HASH)

async def main():
    await client.start(bot_token=BOT_TOKEN)
    invite_link = "https://t.me/+WjseTSWTUoo1OTRk"
    
    try:
        from telethon.tl.functions.messages import CheckChatInviteRequest
        hash_str = invite_link.split("/")[-1].replace("+", "")
        
        result = await client(CheckChatInviteRequest(hash_str))
        if hasattr(result, 'chat'):
            chat_id = result.chat.id
            print(f"\n==========================================")
            print(f"-> ID NUMÉRICO DEL CANAL: -100{chat_id}")
            print(f"==========================================\n")
        else:
            print("El bot necesita tener acceso al enlace o haber sido añadido previamente.")
    except Exception as e:
        print(f"Error al resolver: {e}")

with client:
    client.loop.run_until_complete(main())