import asyncio
from telethon import TelegramClient

API_ID = 0
API_HASH = "TU_API_HASH_AQUI"
BOT_TOKEN = "TU_BOT_TOKEN_AQUI"
SESSION_NAME = "nigroserver_session"

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