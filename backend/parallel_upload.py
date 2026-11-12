"""
Subida en paralelo de archivos grandes para Telethon (código propio).

Telethon sube cada parte de 512 KiB esperando la respuesta antes de enviar la
siguiente (una petición cada vez). Este módulo mantiene varias partes en vuelo a
la vez y, además, abre conexiones extra al mismo centro de datos para repartir la
carga.

Seguridad ante fallos:
  * Si una conexión extra falla, se descarta y sus partes las completan las demás.
  * En el peor caso funciona como la conexión principal con varias partes en vuelo.
  * Las partes ya subidas se conservan en `UploadState`: si hay que reintentar,
    solo se vuelven a enviar las que faltan.

Solo usa funciones públicas de Telethon salvo para abrir las conexiones extra
(`client._get_dc`, `client._connection`, `client._call`, `client._init_request`),
que son internas. Si cambian en una versión futura, las conexiones extra no se
abrirán (se registra un aviso) y la subida seguirá por la conexión principal.
"""
import asyncio
import copy
import logging
import math
import os
from collections import deque
from dataclasses import dataclass, field

from telethon import functions, helpers, types

try:  # internos de Telethon: opcionales
    from telethon.network import MTProtoSender
    from telethon.tl.alltlobjects import LAYER
except Exception:  # pragma: no cover
    MTProtoSender = None
    LAYER = None

log = logging.getLogger("nigro.upload")

PART_SIZE = 512 * 1024                 # máximo que permite Telegram
BIG_FILE_THRESHOLD = 10 * 1024 * 1024  # por debajo Telegram usa otro método (con MD5)
MAX_PARTS = 4000                       # límite de Telegram (~2000 MiB con partes de 512 KiB)
MIN_PARTS_FOR_EXTRA = 40               # no compensa abrir conexiones extra para menos
MAX_PART_FAILURES = 5                  # fallos seguidos de una parte en la conexión principal
MAX_ROUNDS = 4
EXTRA_CONNECT_TIMEOUT = 30


@dataclass
class UploadState:
    """Estado reanudable de una subida (mismo file_id + partes ya enviadas)."""
    file_id: int = field(default_factory=helpers.generate_random_long)
    done: set = field(default_factory=set)

    def reset(self):
        self.file_id = helpers.generate_random_long()
        self.done.clear()


def _part_len(index: int, file_size: int) -> int:
    return min(PART_SIZE, file_size - index * PART_SIZE)


def _read_part(fh, index: int, file_size: int) -> bytes:
    fh.seek(index * PART_SIZE)
    data = fh.read(_part_len(index, file_size))
    if len(data) != _part_len(index, file_size):
        raise IOError(f"Lectura incompleta de la parte {index}: ¿cambió el archivo durante la subida?")
    return data


async def _safe_disconnect(sender):
    try:
        await asyncio.wait_for(sender.disconnect(), 10)
    except BaseException:
        pass


async def _open_extra_sender(client):
    """Abre una conexión extra al DC de la sesión usando la misma clave de autorización."""
    if MTProtoSender is None or LAYER is None:
        raise RuntimeError("Esta versión de Telethon no expone MTProtoSender")
    dc = await client._get_dc(client.session.dc_id)
    sender = MTProtoSender(client.session.auth_key, loggers=client._log,
                           updates_queue=asyncio.Queue())
    try:
        await asyncio.wait_for(
            sender.connect(client._connection(
                dc.ip_address, dc.port, dc.id,
                loggers=client._log, proxy=client._proxy, local_addr=client._local_addr)),
            EXTRA_CONNECT_TIMEOUT)
        init = copy.copy(client._init_request)
        init.query = functions.help.GetConfigRequest()
        await asyncio.wait_for(
            sender.send(functions.InvokeWithLayerRequest(LAYER, init)),
            EXTRA_CONNECT_TIMEOUT)
    except BaseException:
        await _safe_disconnect(sender)
        raise
    return sender


async def _send_part(client, sender, file_id, index, part_count, data):
    request = functions.upload.SaveBigFilePartRequest(file_id, index, part_count, data)
    if sender is None:
        ok = await client(request)
    else:
        ok = await client._call(sender, request)
    if not ok:
        raise RuntimeError(f"Telegram rechazó la parte {index}")


async def _gather_or_cancel(tasks):
    try:
        await asyncio.gather(*tasks)
    except BaseException:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise


async def upload_file_parallel(client, path, *, file_name=None, connections=4,
                               pipeline=3, progress_callback=None, state=None):
    """
    Sube `path` a Telegram y devuelve el InputFile listo para `client.send_file`.

    connections: conexiones totales (1 principal + extras).
    pipeline:    partes en vuelo por conexión.
    state:       UploadState para poder reanudar tras un fallo.
    """
    file_size = os.path.getsize(path)
    file_name = file_name or os.path.basename(path)

    if file_size <= BIG_FILE_THRESHOLD:
        return await client.upload_file(path, file_name=file_name,
                                        progress_callback=progress_callback)

    part_count = math.ceil(file_size / PART_SIZE)
    if part_count > MAX_PARTS:
        raise ValueError(
            f"El archivo supera el límite de Telegram (~{MAX_PARTS * PART_SIZE // (1024 * 1024)} MiB)")

    state = state if state is not None else UploadState()
    done_bytes = sum(_part_len(i, file_size) for i in state.done)
    failures = {}
    dead = set()
    extras = []

    if progress_callback and done_bytes:
        progress_callback(done_bytes, file_size)

    async def worker(sender, pending):
        nonlocal done_bytes
        with open(path, "rb") as fh:
            while id(sender) not in dead:
                try:
                    idx = pending.popleft()
                except IndexError:
                    return
                try:
                    data = await asyncio.to_thread(_read_part, fh, idx, file_size)
                    await _send_part(client, sender, state.file_id, idx, part_count, data)
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    pending.appendleft(idx)
                    if sender is not None:
                        log.warning("Conexión extra descartada (parte %s): %r", idx, e)
                        dead.add(id(sender))
                        return
                    failures[idx] = failures.get(idx, 0) + 1
                    if failures[idx] >= MAX_PART_FAILURES:
                        raise
                    log.warning("Fallo en la parte %s (intento %s): %r", idx, failures[idx], e)
                    await asyncio.sleep(min(2 ** failures[idx], 15))
                    continue
                state.done.add(idx)
                done_bytes += len(data)
                if progress_callback:
                    progress_callback(done_bytes, file_size)

    try:
        missing = part_count - len(state.done)
        if connections > 1 and missing >= MIN_PARTS_FOR_EXTRA:
            results = await asyncio.gather(
                *[_open_extra_sender(client) for _ in range(connections - 1)],
                return_exceptions=True)
            for r in results:
                if isinstance(r, BaseException):
                    log.warning("No se pudo abrir una conexión extra: %r", r)
                else:
                    extras.append(r)
        log.info("Subiendo %s: %d partes, %d conexión(es) + %d parte(s) en vuelo cada una",
                 file_name, part_count, 1 + len(extras), pipeline)

        for _ in range(MAX_ROUNDS):
            if len(state.done) >= part_count:
                break
            pending = deque(i for i in range(part_count) if i not in state.done)
            senders = [None] + [s for s in extras if id(s) not in dead]
            tasks = [asyncio.create_task(worker(s, pending))
                     for s in senders for _ in range(pipeline)]
            await _gather_or_cancel(tasks)

        if len(state.done) < part_count:
            raise RuntimeError(
                f"No se pudo completar la subida ({len(state.done)}/{part_count} partes)")
    finally:
        if extras:
            await asyncio.gather(*[_safe_disconnect(s) for s in extras],
                                 return_exceptions=True)

    return types.InputFileBig(state.file_id, part_count, file_name)