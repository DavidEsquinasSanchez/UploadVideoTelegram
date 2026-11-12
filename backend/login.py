from telethon import TelegramClient

API_ID = 33819641
API_HASH = "bd4862988b1bfa11d394d616e0a63ff1"
SESSION_NAME = "nigroserver_session"
BOT_TOKEN = "9113910117:AAFSWiajOgvAEClTlcKV_05qcJ0i2CekZFE"

# Inicialización directa del bot
client = TelegramClient(SESSION_NAME, API_ID, API_HASH).start(bot_token=BOT_TOKEN)

async def main():
    me = await client.get_me()
    print(f"¡Conexión exitosa! Autenticado como el bot: @{me.username}")

with client:
    client.loop.run_until_complete(main())