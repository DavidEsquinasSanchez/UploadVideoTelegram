"""
NigroServer - Telegram Uploader (backend + servidor del frontend).

Un solo proceso y un solo puerto: FastAPI sirve la interfaz (index.html, css, js,
images) y la API (/api/...). Arranque: iniciar.bat (o `python backend/main.py`).
"""
import asyncio
import json
import logging
import logging.handlers
import math
import os
import re
import secrets
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.datastructures import MutableHeaders
from telethon import TelegramClient, errors, functions, types

from parallel_upload import UploadState, upload_file_parallel

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

# ---------------------------------------------------------------------------
# CONFIGURACIÓN
# Se cargan automáticamente desde el archivo .env o variables de entorno
# (TG_API_ID, TG_API_HASH, TG_BOT_TOKEN)
# ---------------------------------------------------------------------------
API_ID = int(os.getenv("TG_API_ID", "0"))
API_HASH = os.getenv("TG_API_HASH", "")
BOT_TOKEN = os.getenv("TG_BOT_TOKEN", "")
SESSION_NAME = "nigroserver_session"

TARGET_CHANNELS = [
    -1004433458655,
    -1003975241498
]

# Servidor: solo accesible desde este equipo
HOST = "127.0.0.1"
PORT = 3000

# Subida de archivos
UPLOAD_CONNECTIONS = 4      # conexiones simultáneas a Telegram por archivo grande
UPLOAD_PIPELINE = 3         # partes en vuelo por conexión
UPLOAD_ATTEMPTS = 4         # intentos de subida (reanudando las partes ya enviadas)
SEND_ATTEMPTS = 5           # intentos del envío final

# Escaneo de canales
SCAN_BATCH = 100            # IDs por petición
SCAN_MIN_INTERVAL = 0.15    # pausa mínima entre peticiones de escaneo (compartida por todos los canales)
EMPTY_BATCHES_TO_STOP = 3
FALLBACK_MAX_ID = 3000      # solo para sembrar temas cuando no hay caché
SCAN_VERSION = 4            # súbelo para forzar un reescaneo completo de mensajes

# Rutas (por defecto junto a este archivo; el frontend está en la carpeta superior)
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("NIGRO_DATA_DIR", BASE_DIR))
FRONTEND_DIR = Path(os.getenv("NIGRO_FRONTEND_DIR", BASE_DIR.parent))
LOG_DIR = DATA_DIR / "logs"
CACHE_FILE = DATA_DIR / "topics_cache.json"
SESSION_PATH = str(DATA_DIR / SESSION_NAME)
TEMP_DIR = DATA_DIR / "temp_uploads"
SPLIT_THRESHOLD_BYTES = 1950 * 1024 * 1024  # 1950 MB (margen de seguridad para Telegram Free / Bot)

LOG_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)


def purge_temp_dir():
    """Elimina fragmentos temporales huérfanos que hayan podido quedar en disco."""
    if TEMP_DIR.is_dir():
        for f in TEMP_DIR.iterdir():
            if f.is_file():
                try:
                    f.unlink()
                except Exception:
                    pass


# ---------------------------------------------------------------------------
# LOGGING (consola + archivo con rotación, con los secretos ocultos)
# ---------------------------------------------------------------------------
def _secrets():
    return [s for s in (BOT_TOKEN, API_HASH) if s and "PON_AQUI" not in s]


class RedactingFormatter(logging.Formatter):
    def format(self, record):
        text = super().format(record)
        for secret in _secrets():
            text = text.replace(secret, "***")
        return text


def setup_logging():
    fmt = RedactingFormatter("%(asctime)s [%(levelname)s] %(message)s", "%H:%M:%S")
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    for h in list(root.handlers):
        root.removeHandler(h)
    console = logging.StreamHandler()
    console.setFormatter(fmt)
    file_handler = logging.handlers.RotatingFileHandler(
        LOG_DIR / "nigroserver.log", maxBytes=2 * 1024 * 1024, backupCount=5, encoding="utf-8")
    file_handler.setFormatter(fmt)
    root.addHandler(console)
    root.addHandler(file_handler)
    logging.getLogger("telethon").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


setup_logging()
log = logging.getLogger("nigro")


def public_error(exc: BaseException) -> str:
    text = str(exc) or exc.__class__.__name__
    for secret in _secrets():
        text = text.replace(secret, "***")
    return text


# ---------------------------------------------------------------------------
# ESTADO GLOBAL
# ---------------------------------------------------------------------------
client: Optional[TelegramClient] = None
bot_username = ""
started_at = time.time()
API_TOKEN = secrets.token_urlsafe(32)   # se inyecta en index.html; las llamadas /api lo exigen

selected_files = {}      # fileId -> {"path", "name", "size"}  (elegidos con el selector nativo)
progress = {}            # clave de subida -> {"percent", "status", "ts"}
active_uploads = {}      # clave de subida -> asyncio.Task
trackers = {}            # clave de subida -> SpeedTracker (para el tiempo restante)
refresh_task: Optional[asyncio.Task] = None
refresh_guard = asyncio.Lock()
dialog_lock = asyncio.Lock()

active_download_task: Optional[asyncio.Task] = None
download_state = {
    "active": False,
    "status": "Inactivo",
    "percent": 0,
    "eta": None,
    "speed": None,
    "current_file": "",
    "file_index": 0,
    "total_files": 0,
    "dest_dir": "",
    "queue": [],
    "error": None,
    "logs": []
}
download_tracker: Optional["SpeedTracker"] = None


def add_download_log(msg: str, log_type: str = "info"):
    log.info("[DOWNLOAD] %s", msg)
    download_state["logs"].append({"msg": msg, "type": log_type, "ts": time.time()})
    if len(download_state["logs"]) > 150:
        download_state["logs"].pop(0)


class RateLimiter:
    """Separa las peticiones de escaneo un intervalo mínimo, aunque vengan de varios canales a la vez."""

    def __init__(self, interval: float):
        self.interval = interval
        self._lock = asyncio.Lock()
        self._next = 0.0

    async def wait(self):
        async with self._lock:
            delay = self._next - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            self._next = time.monotonic() + self.interval


scan_limiter = RateLimiter(SCAN_MIN_INTERVAL)


class SpeedTracker:
    """Velocidad media de los últimos segundos (ventana deslizante) para estimar el tiempo restante."""

    def __init__(self, window: float = 20.0, min_span: float = 2.0):
        self.window = window
        self.min_span = min_span
        self.total = 0
        self.samples = deque()

    def add(self, current: int, total: int, now: Optional[float] = None):
        now = time.monotonic() if now is None else now
        self.total = total
        self.samples.append((now, current))
        while len(self.samples) > 2 and now - self.samples[0][0] > self.window:
            self.samples.popleft()

    def eta(self, now: Optional[float] = None) -> Optional[int]:
        """Segundos que faltan, o None si todavía no hay datos suficientes (o la subida está parada)."""
        if not self.samples:
            return None
        now = time.monotonic() if now is None else now
        last_b = self.samples[-1][1]
        pts = [(t, b) for t, b in self.samples if now - t <= self.window] or [self.samples[-1]]
        first_t, first_b = pts[0]
        span = now - first_t
        if span < self.min_span or last_b <= first_b:
            return None
        speed = (last_b - first_b) / span
        return int(round(max(0, self.total - last_b) / speed))

    def speed(self, now: Optional[float] = None) -> Optional[float]:
        """Velocidad en bytes/segundo (ventana deslizante), o None."""
        if not self.samples:
            return None
        now = time.monotonic() if now is None else now
        pts = [(t, b) for t, b in self.samples if now - t <= self.window] or [self.samples[-1]]
        first_t, first_b = pts[0]
        span = now - first_t
        last_b = self.samples[-1][1]
        if span < self.min_span or last_b <= first_b:
            return None
        return (last_b - first_b) / span


# ---------------------------------------------------------------------------
# CICLO DE VIDA
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global client, bot_username, refresh_task
    purge_temp_dir()
    import telethon
    log.info("Telethon %s (%s)", telethon.__version__, Path(telethon.__file__).parent)
    try:
        import cryptg  # noqa: F401
        log.info("cryptg disponible: cifrado acelerado")
    except Exception:
        log.warning("cryptg NO está instalado: el cifrado de Telethon será más lento")

    if not API_ID or not API_HASH or not BOT_TOKEN or "PON_AQUI" in API_HASH or "PON_AQUI" in BOT_TOKEN:
        raise RuntimeError(
            "Faltan credenciales: define TG_API_ID, TG_API_HASH y TG_BOT_TOKEN en el archivo .env.")
    if not (FRONTEND_DIR / "index.html").is_file():
        log.warning("No se encuentra %s: la interfaz no se podrá servir", FRONTEND_DIR / "index.html")

    client = TelegramClient(SESSION_PATH, API_ID, API_HASH,
                            connection_retries=10, retry_delay=2,
                            request_retries=5, flood_sleep_threshold=120)
    await client.start(bot_token=BOT_TOKEN)
    me = await client.get_me()
    bot_username = getattr(me, "username", "") or ""
    log.info("Conectado a Telegram como bot @%s", bot_username)
    log.info("Abre la herramienta en  http://%s:%s", HOST, PORT)

    # Escaneo inicial en segundo plano: la interfaz arranca con la caché y se actualiza sola
    refresh_task = asyncio.create_task(refresh_all(False))

    yield

    for task in list(active_uploads.values()):
        task.cancel()
    if active_download_task and not active_download_task.done():
        active_download_task.cancel()
    if refresh_task and not refresh_task.done():
        refresh_task.cancel()
    all_tasks = [t for t in (refresh_task, active_download_task, *active_uploads.values()) if t]
    await asyncio.gather(*all_tasks, return_exceptions=True)
    purge_temp_dir()
    await client.disconnect()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


# ---------------------------------------------------------------------------
# SEGURIDAD
# - Solo se acepta Host 127.0.0.1/localhost (frena el DNS rebinding)
# - Las peticiones /api exigen el token de esta ejecución (cabecera X-API-Token) y,
#   si traen Origin, tiene que ser el propio servidor (frena CSRF desde otras webs)
# - No hay CORS: el frontend se sirve desde el mismo origen
# ---------------------------------------------------------------------------
ALLOWED_HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
ALLOWED_ORIGINS = {f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}"}
CSP = ("default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
       "base-uri 'none'; form-action 'self'; frame-ancestors 'none'")


class SecurityMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        path = scope.get("path", "")
        is_api = path.startswith("/api/")

        denied = None
        if headers.get("host", "") not in ALLOWED_HOSTS:
            denied = (403, "Host no permitido")
        elif is_api:
            origin = headers.get("origin")
            if origin is not None and origin not in ALLOWED_ORIGINS:
                denied = (403, "Origen no permitido")
            elif not secrets.compare_digest(headers.get("x-api-token", ""), API_TOKEN):
                denied = (401, "Token inválido o ausente: recarga la página")

        if denied:
            log.warning("Petición rechazada (%s) %s %s", denied[1], scope.get("method"), path)
            await JSONResponse({"detail": denied[1]}, status_code=denied[0])(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                h = MutableHeaders(scope=message)
                h["X-Content-Type-Options"] = "nosniff"
                h["X-Frame-Options"] = "DENY"
                h["Referrer-Policy"] = "no-referrer"
                h["Content-Security-Policy"] = CSP
                h["Cache-Control"] = "no-store" if (is_api or path == "/") else "no-cache"
            await send(message)

        await self.app(scope, receive, send_with_headers)


app.add_middleware(SecurityMiddleware)


# ---------------------------------------------------------------------------
# CACHÉ (temas y vídeos)
#   "title", "forum":  datos del canal (para pintar la interfaz sin consultar Telegram)
#   "scan_v", "msg_scanned": hasta qué mensaje se ha revisado
#   "topics": {id_tema: nombre}      "videos": {id_mensaje: [id_tema, nombre]}
# ---------------------------------------------------------------------------
def load_cache() -> dict:
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_cache(cache: dict) -> None:
    tmp = CACHE_FILE.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    os.replace(tmp, CACHE_FILE)


def update_cache_entry(chat_key: str, mutate) -> None:
    """Lee-modifica-guarda sin ningún await de por medio (atómico para el event loop)."""
    cache = load_cache()
    mutate(cache.setdefault(str(chat_key), {}))
    save_cache(cache)


def cache_add_topic(chat_id, topic_id, name: str) -> None:
    update_cache_entry(chat_id, lambda e: e.setdefault("topics", {}).__setitem__(str(topic_id), name))


def cache_add_video(chat_id, message_id: int, topic_id, name: str) -> None:
    update_cache_entry(chat_id, lambda e: e.setdefault("videos", {}).__setitem__(
        str(message_id), [int(topic_id) if topic_id else 1, name]))


def read_cached(chat_key: str):
    entry = load_cache().get(str(chat_key), {})
    topics = {int(k): v for k, v in entry.get("topics", {}).items()}
    videos = {k: list(v) for k, v in entry.get("videos", {}).items()}
    return topics, videos


# ---------------------------------------------------------------------------
# UTILIDADES DE MENSAJES
# ---------------------------------------------------------------------------
VIDEO_EXTENSIONS = (".mp4", ".mkv", ".avi", ".mov", ".webm", ".m4v", ".wmv", ".flv", ".ts")


def is_video(msg) -> bool:
    if not msg or not getattr(msg, "media", None):
        return False
    try:
        if msg.video:
            return True
    except Exception:
        pass
    doc = getattr(msg, "document", None)
    if not doc:
        return False
    if (getattr(doc, "mime_type", "") or "").startswith("video/"):
        return True

    # 1. Comprobar caption (el uploader incluye el nombre con extensión en el caption)
    caption = (getattr(msg, "message", "") or "").strip().lower()
    if caption:
        first_line = caption.splitlines()[0]
        if first_line.endswith(VIDEO_EXTENSIONS):
            return True
        if re.search(r"\.(mp4|mkv|avi|mov|webm|m4v|wmv|flv|ts)\.\d{3,4}$", first_line):
            return True

    # 2. Comprobar atributos del documento
    for attr in getattr(doc, "attributes", []) or []:
        if isinstance(attr, types.DocumentAttributeVideo):
            return True
        if isinstance(attr, types.DocumentAttributeFilename):
            fname = attr.file_name.lower()
            if fname.endswith(VIDEO_EXTENSIONS):
                return True
            if re.search(r"\.(mp4|mkv|avi|mov|webm|m4v|wmv|flv|ts)\.\d{3,4}$", fname):
                return True
            if re.search(r"\.\d{3,4}$", fname):
                return True
    return False


def video_name(msg) -> str:
    caption = (msg.message or "").strip()
    if caption:
        return caption.splitlines()[0]
    if msg.file and msg.file.name:
        return msg.file.name
    return f"Vídeo {msg.id}"


def raw_topic_of(msg) -> int:
    """ID de tema 'en bruto'; se valida contra los temas reales al construir la respuesta."""
    rt = getattr(msg, "reply_to", None)
    if rt:
        return rt.reply_to_top_id or rt.reply_to_msg_id or 1
    return 1


async def get_messages_by_ids(entity, ids):
    # channels.getMessages: los bots SÍ pueden usarlo (getHistory/getReplies no)
    while True:
        await scan_limiter.wait()
        try:
            return await client.get_messages(entity, ids=ids)
        except errors.FloodWaitError as e:
            log.warning("FloodWait: esperando %ss...", e.seconds)
            await asyncio.sleep(e.seconds + 1)


async def fetch_topics_by_ids(entity, ids):
    """Devuelve {id_tema: {"title": nombre, "top": id del último mensaje del tema}}."""
    try:
        request = functions.messages.GetForumTopicsByIDRequest(peer=entity, topics=ids)
    except AttributeError:
        request = functions.channels.GetForumTopicsByIDRequest(channel=entity, topics=ids)

    while True:
        await scan_limiter.wait()
        try:
            result = await client(request)
            break
        except errors.FloodWaitError as e:
            log.warning("FloodWait: esperando %ss...", e.seconds)
            await asyncio.sleep(e.seconds + 1)

    return {
        t.id: {"title": t.title, "top": getattr(t, "top_message", 0) or 0}
        for t in result.topics
        if isinstance(t, types.ForumTopic)
    }


async def load_topic_info(entity, ids):
    info = {}
    ids = sorted(ids)
    for i in range(0, len(ids), SCAN_BATCH):
        info.update(await fetch_topics_by_ids(entity, ids[i:i + SCAN_BATCH]))
    return info


# ---------------------------------------------------------------------------
# SINCRONIZACIÓN DE UN CANAL (temas + vídeos)
# Cada tema indica el ID de su último mensaje ("top_message"). El mayor de todos es
# el final real del canal: se escanea TODO el rango hasta ahí sin cortar por huecos
# y después se comprueba la cola por si hay mensajes o temas más recientes.
# ---------------------------------------------------------------------------
def process_message(m, videos, new_topic_ids) -> bool:
    if not m:
        return False
    if isinstance(getattr(m, "action", None), types.MessageActionTopicCreate):
        new_topic_ids.add(m.id)
    if is_video(m):
        videos[str(m.id)] = [raw_topic_of(m), video_name(m)]
    return True


async def scan_range(entity, chat_key, first, last, videos, new_topic_ids) -> int:
    top = 0
    log.info("[SCAN] %s: mensajes %s..%s", chat_key, first, last)
    for n, start in enumerate(range(first, last + 1, SCAN_BATCH)):
        ids = list(range(start, min(start + SCAN_BATCH, last + 1)))
        for m in await get_messages_by_ids(entity, ids):
            if process_message(m, videos, new_topic_ids):
                top = max(top, m.id)
        if n % 10 == 9:
            log.info("[SCAN] %s: revisados hasta ~%s de %s", chat_key, ids[-1], last)
    return top


async def scan_tail(entity, first, videos, new_topic_ids) -> int:
    top = 0
    empty = 0
    while empty < EMPTY_BATCHES_TO_STOP:
        ids = list(range(first, first + SCAN_BATCH))
        found = False
        for m in await get_messages_by_ids(entity, ids):
            if process_message(m, videos, new_topic_ids):
                found = True
                top = max(top, m.id)
        empty = 0 if found else empty + 1
        first += SCAN_BATCH
    return top


async def sync_channel(entity, chat_key: str, force_rescan: bool = False, title: str = "", forum: bool = True):
    cache = load_cache()
    entry = cache.get(chat_key, {})
    topics_known = {int(k): v for k, v in entry.get("topics", {}).items()}
    videos = {k: list(v) for k, v in entry.get("videos", {}).items()}
    msg_scanned = entry.get("msg_scanned", 0)

    if force_rescan or entry.get("scan_v") != SCAN_VERSION:
        videos = {}
        msg_scanned = 0

    try:
        # 1) Temas conocidos (+ General). Sin caché, se siembran buscando por ID.
        if forum:
            candidates = set(topics_known) | {1}
            if len(candidates) <= 1:
                log.info("[SCAN] %s: sin caché de temas, busco por ID hasta %s", chat_key, FALLBACK_MAX_ID)
                candidates |= set(range(1, FALLBACK_MAX_ID + 1))
            topics = await load_topic_info(entity, candidates)
        else:
            topics = {1: {"title": "General", "top": 0}}

        # 2) Revalidar vídeos conocidos (borrados / caption editado)
        known_ids = sorted(int(k) for k in videos)
        for i in range(0, len(known_ids), SCAN_BATCH):
            chunk = known_ids[i:i + SCAN_BATCH]
            msgs = await get_messages_by_ids(entity, chunk)
            for mid, m in zip(chunk, msgs):
                if m and is_video(m):
                    videos[str(mid)] = [raw_topic_of(m), video_name(m)]
                else:
                    videos.pop(str(mid), None)

        # 3) Mensajes nuevos: hasta el final real del canal
        new_topic_ids = set()
        scanned_to = msg_scanned
        tail_done = False
        rounds = 4 if forum else 1
        for _ in range(rounds):
            target = max((t["top"] for t in topics.values()), default=0)
            if target > scanned_to:
                await scan_range(entity, chat_key, scanned_to + 1, target, videos, new_topic_ids)
                scanned_to = target
            if not tail_done:
                scanned_to = max(scanned_to, await scan_tail(entity, scanned_to + 1, videos, new_topic_ids))
                tail_done = True
            missing = new_topic_ids - set(topics)
            new_topic_ids -= missing
            if not missing:
                break
            if forum:
                topics.update(await load_topic_info(entity, missing))

        names = {k: v["title"] for k, v in topics.items()} if forum else {}

        def commit(e):
            # Conserva lo que haya añadido otra tarea (subidas, temas nuevos) más allá de lo escaneado
            for k, v in e.get("videos", {}).items():
                if int(k) > scanned_to and k not in videos:
                    videos[k] = v
            for k, v in e.get("topics", {}).items():
                if int(k) > scanned_to and int(k) not in names:
                    names[int(k)] = v
            e.update({"scan_v": SCAN_VERSION, "msg_scanned": scanned_to, "title": title,
                      "forum": forum, "topics": {str(k): v for k, v in names.items()},
                      "videos": videos})

        update_cache_entry(chat_key, commit)
        log.info("[SYNC] %s: temas=%s, vídeos=%s, revisado hasta el mensaje %s",
                 chat_key, len(names), len(videos), scanned_to)
        return names, videos

    except Exception as e:
        log.error("Error al sincronizar %s: %s", chat_key, public_error(e), exc_info=True)
        log.warning("Se usan los datos guardados en caché.")
        return read_cached(chat_key)


# ---------------------------------------------------------------------------
# GRUPOS (lo que pinta la barra lateral)
# ---------------------------------------------------------------------------
def natural_sort_key(s: str):
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r"(\d+)", str(s or ""))]


def assemble_group(identifier, title, forum, topics, videos) -> dict:
    topics_list = []
    direct_videos = []
    if forum:
        by_topic = {}
        for tid, name in videos.values():
            key = tid if tid in topics else 1
            by_topic.setdefault(key, []).append(name)
        topics_list = [
            {"id": str(tid), "nombre": tname, "videos": sorted(by_topic.get(tid, []), key=natural_sort_key)}
            for tid, tname in sorted(topics.items(), key=lambda kv: kv[1].lower())
            if str(tid) != "1" and tname.strip().lower() != "general"
        ]
    else:
        direct_videos = sorted([name for _, name in videos.values()], key=natural_sort_key)
    return {"id": str(identifier), "nombre": title, "tieneTemas": bool(forum), "temas": topics_list, "videos": direct_videos}


async def group_from_cache(identifier):
    key = str(identifier)
    entry = load_cache().get(key)
    if not entry:
        return None
    title, forum = entry.get("title"), entry.get("forum")
    if title is None or forum is None:       # caché de una versión anterior: se completa con Telegram
        try:
            entity = await client.get_entity(identifier)
            title = getattr(entity, "title", key)
            forum = bool(getattr(entity, "forum", False))
        except Exception:
            return None
    topics, videos = read_cached(key)
    return assemble_group(identifier, title, forum, topics, videos)


async def load_group(identifier, rescan: bool = False):
    key = str(identifier)
    try:
        entity = await client.get_entity(identifier)
        title = getattr(entity, "title", key)
        forum = bool(getattr(entity, "forum", False))
        topics, videos = await sync_channel(entity, key, rescan, title=title, forum=forum)
        group = assemble_group(identifier, title, forum, topics, videos)
        v_count = len(group.get("videos", [])) if not forum else sum(len(t["videos"]) for t in group["temas"])
        log.info("[OK] %s: foro=%s, temas=%s, vídeos=%s", title, forum, len(group["temas"]), v_count)
        return group
    except Exception as e:
        log.error("No se pudo resolver el canal %s: %s", identifier, public_error(e), exc_info=True)
        return await group_from_cache(identifier)
    except Exception as e:
        log.error("No se pudo resolver el canal %s: %s", identifier, public_error(e), exc_info=True)
        return await group_from_cache(identifier)


async def refresh_all(rescan: bool = False) -> list:
    results = await asyncio.gather(*[load_group(i, rescan) for i in TARGET_CHANNELS])
    return [g for g in results if g and g.get("nombre", "").strip().lower() != "general"]


async def run_refresh(rescan: bool = False) -> list:
    """Une la petición a un escaneo en curso (o lanza uno nuevo)."""
    global refresh_task
    while True:
        async with refresh_guard:
            running = refresh_task is not None and not refresh_task.done()
            if not running:
                refresh_task = asyncio.create_task(refresh_all(rescan))
                task = refresh_task
                break
            if not rescan:
                task = refresh_task
                break
            to_wait = refresh_task
        await asyncio.shield(to_wait)       # un reescaneo espera a que termine el actual
    return await asyncio.shield(task)


# ---------------------------------------------------------------------------
# VALIDACIÓN DE ENTRADAS
# ---------------------------------------------------------------------------
KEY_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def validate_key(key: str) -> str:
    if not KEY_RE.match(key or ""):
        raise HTTPException(400, "Identificador de subida no válido")
    return key


def validate_chat(chat_id: str) -> int:
    try:
        chat = int(chat_id)
    except (TypeError, ValueError):
        raise HTTPException(400, "Canal no válido")
    if chat not in TARGET_CHANNELS:
        raise HTTPException(403, "Canal no permitido")
    return chat


def validate_target(chat_id: str, topic_id: Optional[str]):
    chat = validate_chat(chat_id)
    topic = None
    if topic_id and topic_id != "null":
        try:
            topic = int(topic_id)
        except ValueError:
            raise HTTPException(400, "Tema no válido")
        if topic not in read_cached(str(chat))[0]:
            raise HTTPException(400, "Tema desconocido: recarga la página")
    return chat, topic


def sanitize_name(name: str) -> str:
    name = re.sub(r"[\x00-\x1f\x7f]", "", name or "")
    name = name.replace("\\", "_").replace("/", "_").strip().strip(".")
    name = name[:200]
    if not name:
        raise HTTPException(400, "Nombre de archivo no válido")
    return name


# ---------------------------------------------------------------------------
# MOTOR DE SUBIDA
# ---------------------------------------------------------------------------
def update_progress(key: str, **kw):
    entry = progress.setdefault(key, {"percent": 0, "status": ""})
    entry.update(kw)
    entry["ts"] = time.time()


def purge_progress(max_age: float = 600.0):
    now = time.time()
    for k in [k for k, v in progress.items() if k not in active_uploads and now - v.get("ts", now) > max_age]:
        progress.pop(k, None)


def _is_missing_parts(exc: BaseException) -> bool:
    name = type(exc).__name__.upper()
    msg = str(getattr(exc, "message", "") or exc).upper()
    return "FILEPART" in name or "FILEIDINVALID" in name or "FILE_PART" in msg


async def upload_with_retries(key, path, name, on_progress, state):
    last = None
    for attempt in range(1, UPLOAD_ATTEMPTS + 1):
        try:
            return await upload_file_parallel(
                client, path, file_name=name, connections=UPLOAD_CONNECTIONS,
                pipeline=UPLOAD_PIPELINE, progress_callback=on_progress, state=state)
        except asyncio.CancelledError:
            raise
        except ValueError:
            raise                       # p. ej. archivo demasiado grande: reintentar no sirve
        except Exception as e:
            last = e
            if attempt == UPLOAD_ATTEMPTS:
                break
            wait = min(5 * attempt, 30)
            log.warning("Subida de '%s' interrumpida (%s). Reanudo en %ss (intento %s/%s)",
                        name, public_error(e), wait, attempt + 1, UPLOAD_ATTEMPTS)
            update_progress(key, status=f"Reintentando ({attempt}/{UPLOAD_ATTEMPTS - 1}) en {wait}s")
            await asyncio.sleep(wait)
    raise last


async def send_with_retries(key, entity, uploaded, name, topic_id, original_name=None):
    last = None
    caption = name
    if original_name and original_name != name:
        caption = f"{name}\n[orig:{original_name}]"
    for attempt in range(1, SEND_ATTEMPTS + 1):
        try:
            update_progress(key, status="Enviando a Telegram")
            return await client.send_file(entity, uploaded, caption=caption, reply_to=topic_id)
        except errors.FloodWaitError as e:
            last = e
            wait = e.seconds + 1
            log.warning("FloodWait al enviar '%s': espero %ss", name, wait)
            update_progress(key, status=f"Esperando a Telegram ({wait}s)")
            await asyncio.sleep(wait)
        except (ConnectionError, TimeoutError, asyncio.TimeoutError, OSError) as e:
            last = e
            if attempt == SEND_ATTEMPTS:
                break
            await asyncio.sleep(min(2 ** attempt, 20))
    raise last


async def upload_and_send(key, path, name, entity, topic_id, on_progress, state, original_name=None):
    for full_attempt in range(2):
        uploaded = await upload_with_retries(key, path, name, on_progress, state)
        try:
            return await send_with_retries(key, entity, uploaded, name, topic_id, original_name=original_name)
        except errors.RPCError as e:
            if full_attempt == 0 and _is_missing_parts(e):
                # Telegram descartó partes ya subidas: se repite la subida completa una vez
                log.warning("Telegram pide repetir la subida de '%s' (%s)", name, public_error(e))
                state.reset()
                update_progress(key, percent=0, status="Reintentando subida completa")
                continue
            raise


async def run_upload(key, path, size, name, chat_id, topic_id, file_id=None, original_name=None):
    started = time.monotonic()
    state = UploadState()
    tracker = SpeedTracker()
    trackers[key] = tracker
    last_logged = [-10]
    update_progress(key, percent=0, status="Preparando...")

    def on_progress(current, total):
        pct = int(current * 100 / total) if total else 0
        tracker.add(current, total)
        update_progress(key, percent=pct, status="Subiendo a Telegram")
        if pct - last_logged[0] >= 10 or pct == 100:
            last_logged[0] = pct
            log.info("Subiendo '%s': %s%% (%s / %s bytes)", name, pct, current, total)

    try:
        log.info("[INICIO] '%s' (%.1f MB) -> chat %s, tema %s", name, size / 1e6, chat_id, topic_id)
        entity = await client.get_entity(chat_id)
        sent = await upload_and_send(key, path, name, entity, topic_id, on_progress, state, original_name=original_name)
        try:
            cache_add_video(chat_id, sent.id, topic_id, name)   # aparece en la barra lateral
        except Exception as e:
            log.warning("No se pudo registrar el vídeo en la caché: %s", public_error(e))
        if file_id:
            selected_files.pop(file_id, None)
        update_progress(key, percent=100, status="Completado")
        elapsed = max(time.monotonic() - started, 0.001)
        log.info("[ÉXITO] '%s' subido en %.0fs (%.1f MB/s)", name, elapsed, size / elapsed / 1e6)
    except asyncio.CancelledError:
        update_progress(key, status="Cancelado")
        log.info("[CANCELADO] '%s'", name)
        raise
    except Exception as e:
        update_progress(key, status=f"Error: {public_error(e)}")
        log.error("[ERROR] Falló la subida de '%s': %s", name, public_error(e), exc_info=True)
        raise
    finally:
        active_uploads.pop(key, None)
        trackers.pop(key, None)


async def start_and_wait(key, path, size, name, chat_id, topic_id, file_id=None, original_name=None):
    if key in active_uploads:
        raise HTTPException(409, "Este archivo ya se está subiendo")
    purge_progress()
    task = asyncio.create_task(run_upload(key, path, size, name, chat_id, topic_id, file_id, original_name=original_name))
    active_uploads[key] = task
    await asyncio.wait({task})              # si el navegador se desconecta, la subida continúa
    if task.cancelled():
        raise HTTPException(409, "Cancelado")
    exc = task.exception()
    if exc:
        raise HTTPException(500, public_error(exc))
    return {"status": 200, "message": "Subido correctamente"}


# ---------------------------------------------------------------------------
# SELECTOR NATIVO DE ARCHIVOS (tkinter en un proceso aparte)
# ---------------------------------------------------------------------------
DIALOG_SCRIPT = r'''
import json, sys
import tkinter as tk
from tkinter import filedialog
root = tk.Tk()
root.withdraw()
root.attributes("-topmost", True)
paths = filedialog.askopenfilenames(
    parent=root, title="Selecciona los vídeos a subir",
    filetypes=[("Vídeos", "*.mp4 *.mkv *.avi *.mov *.webm *.m4v *.wmv *.flv *.ts"),
               ("Todos los archivos", "*.*")])
root.destroy()
sys.stdout.write(json.dumps(list(paths), ensure_ascii=True))
'''


def _run_file_dialog() -> list:
    proc = subprocess.run(
        [sys.executable, "-c", DIALOG_SCRIPT], capture_output=True, text=True, timeout=900,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "El selector de archivos terminó con error")
    return json.loads(proc.stdout or "[]")


# ---------------------------------------------------------------------------
# DIVISIÓN BINARIA DE ARCHIVOS GRANDES (> 1950 MB)
# ---------------------------------------------------------------------------
def extract_binary_part(source_path: str, output_path: str, start_byte: int, length_bytes: int) -> str:
    """Extrae una parte binaria fija del archivo por bytes sin recodificar."""
    with open(source_path, "rb") as f_in, open(output_path, "wb") as f_out:
        f_in.seek(start_byte)
        remaining = length_bytes
        buf_size = 1024 * 1024 * 16  # Bloques de 16 MiB para máxima velocidad
        while remaining > 0:
            chunk = f_in.read(min(remaining, buf_size))
            if not chunk:
                break
            f_out.write(chunk)
            remaining -= len(chunk)
    return output_path


# ---------------------------------------------------------------------------
# ENDPOINTS
# ---------------------------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
async def index():
    page = FRONTEND_DIR / "index.html"
    if not page.is_file():
        return HTMLResponse("index.html no encontrado", status_code=404)
    html = page.read_text(encoding="utf-8")
    meta = f'    <meta name="nigro-token" content="{API_TOKEN}">\n</head>'
    return HTMLResponse(html.replace("</head>", meta, 1))


@app.get("/favicon.ico")
async def favicon():
    return Response(status_code=204)


@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "telegram": bool(client and client.is_connected()),
        "bot": bot_username,
        "scanning": bool(refresh_task and not refresh_task.done()),
        "uploads": len(active_uploads),
        "uptime": int(time.time() - started_at),
    }


@app.get("/api/groups")
async def get_groups(rescan: bool = False, scan: bool = True):
    """
    scan=false  -> devuelve al instante lo que hay en caché
    rescan=true -> escaneo completo de mensajes (ignora la caché de vídeos)
    """
    if not scan:
        groups = await asyncio.gather(*[group_from_cache(i) for i in TARGET_CHANNELS])
        return [g for g in groups if g and g.get("nombre", "").strip().lower() != "general"]
    return await run_refresh(rescan)


@app.post("/api/select_files")
async def select_files():
    """Abre el selector nativo de archivos en este equipo y devuelve los elegidos (fraccionando los > 2000 MB)."""
    if dialog_lock.locked():
        raise HTTPException(409, "Ya hay un selector de archivos abierto")
    async with dialog_lock:
        try:
            paths = await asyncio.to_thread(_run_file_dialog)
        except Exception as e:
            log.error("Selector de archivos: %s", public_error(e))
            raise HTTPException(500, "No se pudo abrir el selector de archivos (¿tkinter instalado?)")

    def _nat_sort_key(path_str: str):
        return [int(text) if text.isdigit() else text.lower() for text in re.split(r"(\d+)", os.path.basename(path_str))]

    paths = sorted(paths, key=_nat_sort_key)
    files = []
    for p in paths:
        if not os.path.isfile(p):
            continue
        size = os.path.getsize(p)
        filename = os.path.basename(p)
        name_no_ext = os.path.splitext(filename)[0]

        if size > SPLIT_THRESHOLD_BYTES:
            num_parts = math.ceil(size / SPLIT_THRESHOLD_BYTES)
            log.info("Archivo grande detectado '%s' (%.1f MB). Se fraccionará en %d partes binarias fijas (1950 MB).",
                     filename, size / (1024 * 1024), num_parts)

            for part_idx in range(1, num_parts + 1):
                part_id = uuid.uuid4().hex
                start_byte = (part_idx - 1) * SPLIT_THRESHOLD_BYTES
                part_size = SPLIT_THRESHOLD_BYTES if part_idx < num_parts else (size - start_byte)
                selected_files[part_id] = {
                    "path": p,
                    "name": filename,
                    "size": part_size,
                    "is_part": True,
                    "part_index": part_idx,
                    "total_parts": num_parts,
                    "start_byte": start_byte,
                    "length_bytes": part_size,
                }
                files.append({
                    "id": part_id,
                    "name": filename,
                    "size": part_size,
                    "isPart": True,
                    "partIndex": part_idx,
                    "totalParts": num_parts,
                    "originalBase": name_no_ext,
                })
        else:
            file_id = uuid.uuid4().hex
            selected_files[file_id] = {
                "path": p,
                "name": filename,
                "size": size,
                "is_part": False,
            }
            files.append({
                "id": file_id,
                "name": filename,
                "size": size,
                "isPart": False,
                "originalBase": name_no_ext,
            })
    return files


@app.post("/api/create_topic")
async def create_topic(categoryId: str = Form(...), topicName: str = Form(...)):
    chat = validate_chat(categoryId)
    name = re.sub(r"[\x00-\x1f\x7f]", "", topicName or "").strip()
    if not name or len(name) > 128:
        raise HTTPException(400, "El nombre del tema debe tener entre 1 y 128 caracteres")

    try:
        entity = await client.get_entity(chat)
    except Exception as e:
        raise HTTPException(500, public_error(e))
    if not getattr(entity, "forum", False):
        raise HTTPException(400, "Este canal no tiene temas")

    if name.lower() in {v.lower() for v in read_cached(str(chat))[0].values()}:
        return {"success": False, "reason": "duplicate"}

    try:
        result = await asyncio.to_thread(_bot_api_create_topic, chat, name)
    except Exception as e:
        log.error("Error al crear el tema: %s", public_error(e))
        raise HTTPException(500, public_error(e))

    if result.get("ok"):
        topic_id = result["result"]["message_thread_id"]
        log.info("Tema creado: id=%s nombre=%s", topic_id, name)
        cache_add_topic(chat, topic_id, name)
        return {"success": True, "topic": {"id": str(topic_id), "nombre": name}}
    reason = result.get("description", "Error desconocido")
    log.warning("No se pudo crear el tema en Telegram: %s", reason)
    return {"success": False, "reason": reason}


def _bot_api_create_topic(chat_id: int, name: str) -> dict:
    """Llamada HTTP bloqueante a la Bot API (se ejecuta en un hilo, no en el event loop)."""
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/createForumTopic"
    req = urllib.request.Request(
        url, data=json.dumps({"chat_id": chat_id, "name": name}).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode())
        except Exception:
            return {"ok": False, "description": f"HTTP {e.code}"}


@app.get("/api/progress/{key}")
async def get_progress(key: str):
    entry = progress.get(key)
    if not entry:
        return {"percent": 0, "status": "Pendiente...", "eta": None}
    status = entry.get("status", "")
    tracker = trackers.get(key)
    eta = tracker.eta() if (tracker and status == "Subiendo a Telegram") else None
    return {"percent": entry.get("percent", 0), "status": status, "eta": eta}


@app.post("/api/upload")
async def upload_selected(
    fileId: str = Form(...),
    transformedName: str = Form(...),
    originalName: str = Form(None),
    chatId: str = Form(...),
    topicId: str = Form(None),
):
    """Sube un archivo elegido con el selector nativo: lee directamente de disco o extrae la parte con FFmpeg."""
    info = selected_files.get(fileId)
    if not info:
        raise HTTPException(404, "Archivo no seleccionado o ya subido: vuelve a seleccionarlo")
    if not os.path.isfile(info["path"]):
        raise HTTPException(404, "El archivo original ya no existe en el disco")
    key = validate_key(fileId)
    chat, topic = validate_target(chatId, topicId)
    name = sanitize_name(transformedName)
    orig_name = (info.get("name") if info else None) or originalName

    upload_path = info["path"]
    is_part = info.get("is_part", False)
    temp_part_file = None

    if is_part:
        temp_part_file = TEMP_DIR / f"{fileId}.tmp"
        part_idx = info.get("part_index", 1)
        total_parts = info.get("total_parts", 1)
        start_byte = info.get("start_byte", 0)
        length_bytes = info.get("length_bytes", 0)
        log.info("[Split] Extrayendo parte binaria %d/%d de '%s' (%.1f MB) -> %s...",
                 part_idx, total_parts, info.get("name", ""), length_bytes / (1024 * 1024), name)
        progress[key] = {
            "percent": 0,
            "status": f"Preparando parte {part_idx}/{total_parts}...",
            "ts": time.time()
        }
        try:
            await asyncio.to_thread(
                extract_binary_part,
                info["path"],
                str(temp_part_file),
                start_byte,
                length_bytes
            )
        except Exception as e:
            log.error("Error al extraer parte binaria: %s", public_error(e), exc_info=True)
            if temp_part_file and temp_part_file.is_file():
                try: temp_part_file.unlink()
                except Exception: pass
            raise HTTPException(500, f"Error al dividir archivo por bytes: {public_error(e)}")

        upload_path = str(temp_part_file)

    try:
        size = os.path.getsize(upload_path)
        return await start_and_wait(key, upload_path, size, name, chat, topic, file_id=fileId, original_name=orig_name)
    finally:
        if temp_part_file and temp_part_file.is_file():
            try:
                temp_part_file.unlink()
                log.info("Fragmento temporal eliminado tras la subida: %s", temp_part_file.name)
            except Exception:
                pass


@app.post("/api/cancel")
async def cancel_uploads(keys: str = Form("")):
    cancelled = []
    for key in [k for k in keys.split(",") if k]:
        task = active_uploads.get(key)
        if task and not task.done():
            task.cancel()
            cancelled.append(key)
    return {"cancelled": cancelled}


# ---------------------------------------------------------------------------
# SELECTOR NATIVO DE CARPETA (para guardar descargas)
# ---------------------------------------------------------------------------
FOLDER_DIALOG_SCRIPT = r'''
import sys
import tkinter as tk
from tkinter import filedialog
root = tk.Tk()
root.withdraw()
root.attributes("-topmost", True)
folder = filedialog.askdirectory(parent=root, title="Selecciona la carpeta donde guardar los vídeos")
root.destroy()
sys.stdout.write(folder or "")
'''


def _run_folder_dialog() -> str:
    proc = subprocess.run(
        [sys.executable, "-c", FOLDER_DIALOG_SCRIPT], capture_output=True, text=True, timeout=900,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "El selector de carpetas terminó con error")
    return (proc.stdout or "").strip()


# ---------------------------------------------------------------------------
# UTILIDADES Y MOTOR DE DESCARGA
# ---------------------------------------------------------------------------
def get_multipart_base(name: str) -> Optional[str]:
    """
    Si el nombre corresponde a un corte binario (ej. 'Serie 1x01.mp4.001' o 'Peli.mp4.002'),
    devuelve el nombre unificado base sin el sufijo de parte (ej. 'Serie 1x01.mp4').
    """
    m = re.match(r"^(.*?\.(?:mp4|mkv|avi|mov|webm|m4v|wmv|flv|ts))\.\d{3,4}$", name, re.IGNORECASE)
    if m:
        return m.group(1)
    m2 = re.match(r"^(.*?)\.\d{3,4}$", name)
    if m2:
        return m2.group(1)
    return None


def detect_container_format(file_path: str) -> Optional[str]:
    """Detecta la extensión real del contenedor de vídeo analizando los magic bytes de cabecera."""
    try:
        with open(file_path, "rb") as f:
            header = f.read(16384)
        if len(header) < 12:
            return None
        # EBML (Matroska / WebM)
        if header.startswith(b"\x1a\x45\xdf\xa3"):
            if b"webm" in header[:64].lower():
                return ".webm"
            return ".mkv"
        # AVI (RIFF .... AVI )
        if header.startswith(b"RIFF") and len(header) >= 12 and header[8:12] == b"AVI ":
            return ".avi"
        # MP4 / QuickTime MOV / M4V
        if b"ftyp" in header[:32]:
            idx = header.find(b"ftyp")
            brand = header[idx+4:idx+8]
            if brand in (b"qt  ", b"moov"):
                return ".mov"
            return ".mp4"
        # FLV
        if header.startswith(b"FLV"):
            return ".flv"
        # WMV / ASF
        if header.startswith(b"\x30\x26\xb2\x75\x8e\x66\xcf\x11"):
            return ".wmv"
        # MPEG-TS (sync byte 0x47 con periodicidad de 188 o 204 bytes)
        if header[0] == 0x47 and len(header) >= 376 and header[188] == 0x47:
            return ".ts"
    except Exception as e:
        log.warning("No se pudo inspeccionar cabecera binaria de '%s': %s", file_path, e)
    return None


def extract_original_meta(msg) -> Optional[str]:
    """Extrae el nombre original guardado en el caption de Telegram si existe ([orig:...])."""
    caption = (getattr(msg, "message", "") or "").strip()
    m = re.search(r"\[orig:(.*?)\]", caption)
    if m:
        return m.group(1).strip()
    return None


def resolve_final_name(msg, current_name: str, file_path: str) -> str:
    """
    Restaura el nombre o la extensión original si difiere:
    1) De los metadatos [orig:...] guardados en Telegram (para archivos subidos con esta versión).
    2) De la inspección de cabecera binaria (para archivos existentes o sin etiqueta).
    """
    target_ext = None
    orig_meta = extract_original_meta(msg) if msg else None
    if orig_meta:
        _, ext = os.path.splitext(orig_meta)
        if ext:
            target_ext = ext.lower()
            add_download_log(f"Formato reconocido por metadatos de Telegram: {target_ext}", "info")

    if not target_ext:
        detected = detect_container_format(file_path)
        if detected:
            target_ext = detected.lower()
            add_download_log(f"Formato detectado por firma binaria (Magic Bytes): {target_ext}", "info")

    if target_ext:
        base, cur_ext = os.path.splitext(current_name)
        if cur_ext.lower() != target_ext:
            restored = f"{base}{target_ext}"
            add_download_log(f"Restaurando formato original: '{current_name}' -> '{restored}'", "info")
            return restored

    return current_name


async def run_download_task(chat_id: int, items_to_download: list, dest_dir: Path):
    global download_tracker, active_download_task
    started_total = time.monotonic()
    total_items = len(items_to_download)
    add_download_log(f"[INICIO DESCARGA] {total_items} elemento(s) -> '{dest_dir}'", "info")
    download_state["active"] = True
    download_state["error"] = None
    download_state["total_files"] = total_items
    download_state["dest_dir"] = str(dest_dir)

    try:
        entity = await client.get_entity(chat_id)

        for item_idx, item in enumerate(items_to_download, 1):
            download_state["file_index"] = item_idx
            target_name = item["final_name"]
            parts = item["parts"]
            num_parts = len(parts)

            item_chat_id = item.get("chat_id", chat_id)
            entity = await client.get_entity(item_chat_id)

            curr_queue_item = None
            if item_idx - 1 < len(download_state.get("queue", [])):
                curr_queue_item = download_state["queue"][item_idx - 1]
                curr_queue_item["status"] = "Descargando"
                curr_queue_item["current_part"] = 1
                curr_queue_item["percent"] = 0

            part_suffix = f" ({num_parts} partes binarias)" if num_parts > 1 else ""
            add_download_log(f"[{item_idx}/{total_items}] Preparando descarga: '{target_name}'{part_suffix}", "info")

            downloaded_temp_files = []
            first_msg = None

            try:
                for p_idx, (mid, pname) in enumerate(parts, 1):
                    msg = await client.get_messages(entity, ids=mid)
                    if not msg or not getattr(msg, "media", None):
                        raise RuntimeError(f"No se encontró el mensaje #{mid} ({pname}) en Telegram")

                    if first_msg is None:
                        first_msg = msg

                    temp_part = dest_dir / f".tmp_part_{p_idx}_{uuid.uuid4().hex[:8]}.part"
                    downloaded_temp_files.append(temp_part)

                    download_tracker = SpeedTracker()
                    last_logged = [-10]
                    part_start = time.monotonic()

                    if curr_queue_item:
                        curr_queue_item["current_part"] = p_idx

                    def on_progress(current, total):
                        pct = int(current * 100 / total) if total else 0
                        spd = None
                        eta = None
                        if download_tracker:
                            download_tracker.add(current, total)
                            eta = download_tracker.eta()
                            spd = download_tracker.speed()

                        download_state["percent"] = pct
                        download_state["eta"] = eta
                        download_state["speed"] = spd

                        part_info = f" (Parte {p_idx}/{num_parts})" if num_parts > 1 else ""
                        status_str = f"Descargando{part_info}: {pct}%"
                        if spd:
                            status_str += f" · {spd / 1e6:.1f} MB/s"
                        if eta is not None:
                            status_str += f" · quedan {eta}s"
                        download_state["status"] = status_str
                        download_state["current_file"] = f"{target_name}{part_info}"

                        if curr_queue_item:
                            curr_queue_item["percent"] = pct
                            curr_queue_item["speed"] = spd
                            curr_queue_item["eta"] = eta
                            curr_queue_item["status"] = status_str

                        if pct - last_logged[0] >= 10 or pct == 100:
                            last_logged[0] = pct
                            log.info("Descargando '%s'%s: %s%% (%s / %s bytes)", target_name, part_info, pct, current, total)

                    add_download_log(f"Descargando parte {p_idx}/{num_parts}: '{pname}'...", "info")
                    await client.download_media(msg, file=str(temp_part), progress_callback=on_progress)
                    part_elapsed = max(time.monotonic() - part_start, 0.001)
                    part_size = temp_part.stat().st_size
                    speed_mb = part_size / part_elapsed / 1e6
                    add_download_log(f"Completada parte {p_idx}/{num_parts}: '{pname}' en {part_elapsed:.0f}s ({speed_mb:.1f} MB/s)", "info")

                # Unión de partes si fue fraccionado
                if num_parts > 1:
                    download_state["status"] = f"Uniendo {num_parts} partes binarias..."
                    if curr_queue_item:
                        curr_queue_item["status"] = f"Uniendo {num_parts} partes..."
                    add_download_log(f"Uniendo {num_parts} partes binarias en un único archivo...", "info")
                    merged_tmp = dest_dir / f".tmp_merged_{uuid.uuid4().hex[:8]}.tmp"
                    with open(merged_tmp, "wb") as f_out:
                        for p in downloaded_temp_files:
                            with open(p, "rb") as f_in:
                                shutil.copyfileobj(f_in, f_out, length=16*1024*1024)
                            try:
                                p.unlink()
                            except Exception:
                                pass
                    downloaded_temp_files = [merged_tmp]
                    assembly_file = merged_tmp
                else:
                    assembly_file = downloaded_temp_files[0]

                # Restaurar formato original si difiere
                final_name = resolve_final_name(first_msg, target_name, str(assembly_file))
                final_dest_path = dest_dir / final_name

                if final_dest_path.exists():
                    base_stem, ext = os.path.splitext(final_name)
                    counter = 1
                    while final_dest_path.exists():
                        final_dest_path = dest_dir / f"{base_stem} ({counter}){ext}"
                        counter += 1
                    final_name = final_dest_path.name

                assembly_file.replace(final_dest_path)
                downloaded_temp_files.clear()

                if curr_queue_item:
                    curr_queue_item["name"] = final_name
                    curr_queue_item["status"] = "Completado"
                    curr_queue_item["percent"] = 100
                    curr_queue_item["speed"] = None
                    curr_queue_item["eta"] = None

                add_download_log(f"[ÉXITO] Guardado archivo completo: '{final_name}'", "success")

            except asyncio.CancelledError:
                raise
            except Exception as e:
                for p in downloaded_temp_files:
                    if p.is_file():
                        try:
                            p.unlink()
                        except Exception:
                            pass
                if curr_queue_item:
                    curr_queue_item["status"] = "Error"
                    curr_queue_item["error"] = str(e)
                add_download_log(f"Error descargando '{target_name}': {public_error(e)}", "error")

        total_elapsed = max(time.monotonic() - started_total, 0.001)
        has_errors = any(it.get("status") == "Error" for it in download_state.get("queue", []))
        if has_errors:
            download_state["status"] = "Finalizado con errores"
            add_download_log(f"[FIN] Descargas finalizadas con errores en {total_elapsed:.0f}s.", "warning")
        else:
            download_state["status"] = "Completado"
            add_download_log(f"[FIN] Todas las descargas finalizadas con éxito en {total_elapsed:.0f}s.", "success")
        download_state["percent"] = 100
        download_state["speed"] = None
        download_state["eta"] = None

    except asyncio.CancelledError:
        add_download_log("Descarga cancelada.", "warning")
        download_state["status"] = "Cancelado"
        download_state["speed"] = None
        download_state["eta"] = None
        for it in download_state.get("queue", []):
            if it.get("status") not in ("Completado", "Error"):
                it["status"] = "Cancelado"
    except Exception as e:
        err_msg = public_error(e)
        add_download_log(f"Error en la descarga: {err_msg}", "error")
        download_state["status"] = f"Error: {err_msg}"
        download_state["error"] = err_msg
        download_state["speed"] = None
        download_state["eta"] = None
        for it in download_state.get("queue", []):
            if it.get("status") not in ("Completado", "Error"):
                it["status"] = "Error"
                it["error"] = err_msg
    finally:
        download_state["active"] = False
        active_download_task = None


@app.post("/api/select_folder")
async def select_folder():
    """Abre el selector nativo de carpetas de Windows para elegir dónde guardar los vídeos."""
    if dialog_lock.locked():
        raise HTTPException(409, "Ya hay un selector abierto")
    async with dialog_lock:
        try:
            folder = await asyncio.to_thread(_run_folder_dialog)
        except Exception as e:
            log.error("Selector de carpetas: %s", public_error(e))
            raise HTTPException(500, "No se pudo abrir el selector de carpetas")
    return {"folder": folder or ""}


@app.post("/api/download")
async def start_download(
    destFolder: str = Form(...),
    chatId: Optional[str] = Form(None),
    topicId: Optional[str] = Form(None),
    videoName: Optional[str] = Form(None),
    itemsJson: Optional[str] = Form(None),
):
    global active_download_task
    if active_download_task and not active_download_task.done():
        raise HTTPException(409, "Ya hay una descarga en curso")

    folder_path = Path(destFolder)
    if not folder_path.is_dir():
        raise HTTPException(400, f"La carpeta de destino no existe: {destFolder}")

    items_to_download = []
    default_chat = None

    # 1) Si se envía una lista estructurada de elementos (desde la tabla de descargas)
    if itemsJson and itemsJson.strip():
        try:
            raw_items = json.loads(itemsJson)
        except Exception:
            raise HTTPException(400, "Formato JSON de items inválido")

        for it in raw_items:
            c_id = validate_chat(it["chatId"])
            if default_chat is None:
                default_chat = c_id
            t_id = None
            if it.get("topicId") is not None and str(it["topicId"]).strip() and str(it["topicId"]) != "null":
                try:
                    t_id = int(it["topicId"])
                except ValueError:
                    t_id = None
            v_name = str(it.get("videoName", "")).strip()
            base = get_multipart_base(v_name) or v_name

            _, cached_videos = read_cached(str(c_id))
            parts = []
            for mid, (tid, vn) in cached_videos.items():
                if t_id is not None and tid != t_id:
                    continue
                vn_base = get_multipart_base(vn) or vn
                if vn_base.lower() == base.lower():
                    parts.append((int(mid), vn))

            if parts:
                parts.sort(key=lambda x: natural_sort_key(x[1]))
                items_to_download.append({"final_name": base, "parts": parts, "chat_id": c_id})

        if not items_to_download:
            raise HTTPException(404, "No se encontraron vídeos válidos en Telegram para los elementos seleccionados")

    # 2) Si se solicita un vídeo concreto directamente
    elif videoName and videoName != "null" and videoName.strip():
        if not chatId:
            raise HTTPException(400, "Falta chatId")
        chat = validate_chat(chatId)
        default_chat = chat
        topic = int(topicId) if topicId and topicId != "null" and topicId.strip() else None
        _, cached_videos = read_cached(str(chat))
        target_name = videoName.strip()
        base = get_multipart_base(target_name) or target_name

        parts = []
        for mid, (tid, vname) in cached_videos.items():
            if topic is not None and tid != topic:
                continue
            v_base = get_multipart_base(vname) or vname
            if v_base.lower() == base.lower():
                parts.append((int(mid), vname))

        if not parts:
            raise HTTPException(404, f"No se encontró el vídeo '{videoName}' en Telegram")

        parts.sort(key=lambda x: natural_sort_key(x[1]))
        items_to_download = [{"final_name": base, "parts": parts, "chat_id": chat}]

    # 3) Si se solicita descargar todo un tema directamente
    elif topicId is not None and chatId is not None:
        chat = validate_chat(chatId)
        default_chat = chat
        topic = int(topicId)
        _, cached_videos = read_cached(str(chat))
        logical_dict = {}
        for mid, (tid, vname) in cached_videos.items():
            if tid != topic:
                continue
            base = get_multipart_base(vname) or vname
            logical_dict.setdefault(base, []).append((int(mid), vname))

        if not logical_dict:
            raise HTTPException(404, "No hay vídeos para descargar en este tema")

        for base in sorted(logical_dict.keys(), key=natural_sort_key):
            parts = sorted(logical_dict[base], key=lambda x: natural_sort_key(x[1]))
            items_to_download.append({"final_name": base, "parts": parts, "chat_id": chat})

    else:
        raise HTTPException(400, "Debes especificar elementos para descargar")

    queue_items = []
    for idx, item in enumerate(items_to_download, 1):
        queue_items.append({
            "id": f"dl_{idx}_{uuid.uuid4().hex[:6]}",
            "name": item["final_name"],
            "chatId": item.get("chat_id", default_chat),
            "parts": len(item["parts"]),
            "current_part": 0,
            "status": "Pendiente",
            "percent": 0,
            "speed": None,
            "eta": None,
            "dest": str(folder_path),
            "error": None
        })

    download_state["logs"].clear()
    download_state["status"] = "Iniciando descarga..."
    download_state["percent"] = 0
    download_state["speed"] = None
    download_state["eta"] = None
    download_state["active"] = True
    download_state["dest_dir"] = str(folder_path)
    download_state["queue"] = queue_items

    active_download_task = asyncio.create_task(run_download_task(default_chat or 0, items_to_download, folder_path))
    return {"ok": True, "total_items": len(items_to_download)}


@app.post("/api/cancel_download")
async def cancel_download():
    global active_download_task
    if active_download_task and not active_download_task.done():
        active_download_task.cancel()
        add_download_log("Cancelación de descarga solicitada por el usuario.", "warning")
        return {"ok": True, "message": "Descarga cancelada"}
    return {"ok": False, "message": "No hay descargas activas"}


@app.post("/api/clear_downloads")
async def clear_downloads():
    if download_state.get("active"):
        download_state["queue"] = [
            it for it in download_state.get("queue", [])
            if it.get("status", "").startswith("Descargando")
            or it.get("status", "").startswith("Uniendo")
            or it.get("status") == "Pendiente"
        ]
    else:
        download_state["queue"] = []
    return {"ok": True, "queue": download_state["queue"]}


@app.get("/api/download_progress")
async def get_download_progress():
    return {
        "active": download_state["active"],
        "status": download_state["status"],
        "percent": download_state["percent"],
        "eta": download_state["eta"],
        "speed": download_state.get("speed"),
        "current_file": download_state["current_file"],
        "file_index": download_state["file_index"],
        "total_files": download_state["total_files"],
        "dest_dir": download_state.get("dest_dir", ""),
        "queue": download_state.get("queue", []),
        "error": download_state["error"],
        "logs": download_state["logs"][-25:]
    }


# Archivos estáticos: solo estas carpetas (nunca la raíz, para no exponer backend/ ni la sesión)
for _folder in ("css", "js", "images"):
    app.mount(f"/{_folder}", StaticFiles(directory=FRONTEND_DIR / _folder, check_dir=False), name=_folder)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT, log_config=None, log_level="info")