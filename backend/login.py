from telethon import TelegramClient

API_ID = 0
API_HASH = "TU_API_HASH_AQUI"
SESSION_NAME = "nigroserver_session"
BOT_TOKEN = "TU_BOT_TOKEN_AQUI"

# Inicialización directa del bot
client = TelegramClient(SESSION_NAME, API_ID, API_HASH).start(bot_token=BOT_TOKEN)

async def main():
    me = await client.get_me()
    print(f"¡Conexión exitosa! Autenticado como el bot: @{me.username}")

with client:
    client.loop.run_until_complete(main())