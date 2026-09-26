import asyncio
import base64
import hashlib
import logging
from collections.abc import AsyncGenerator
from functools import cache
from typing import Annotated

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, Header, HTTPException, Request, status
from pydantic import ValidationError
from qstash import AsyncQStash, Receiver
from qstash.errors import QStashError, SignatureError
from qstash.message import BatchRequest

from api.core.config import settings
from api.services.sync import Job, JobQueue
from api.utils.session import derive_key

log = logging.getLogger(__name__)

JOBS_URL = f"{settings.public_url.rstrip('/')}/jobs"

# Agendar nunca segura a resposta por mais que isso.
_PUBLISH_TIMEOUT = 3


class QStashQueue:
    """Publica os jobs no QStash, que os entrega de volta em `POST /jobs`."""

    def __init__(self) -> None:
        self._client = AsyncQStash(settings.qstash_token, base_url=settings.qstash_url)

    async def enqueue(self, *jobs: Job) -> None:
        if not jobs:
            return

        messages: list[BatchRequest] = [
            {
                "url": JOBS_URL,
                "body": encode_job(job),
                "content_type": "text/plain",
                "deduplication_id": _deduplication_id(job),
                # Um job por vez por usuário: todos usam a mesma sessão do SIGAA.
                "flow_control": {"key": f"sigaa-{job.registration}", "parallelism": 1},
            }
            for job in jobs
        ]
        try:
            async with asyncio.timeout(_PUBLISH_TIMEOUT):
                await self._client.message.batch(messages)
        except QStashError, httpx.HTTPError, TimeoutError:
            # Sem o job, o cache só segue vencido até o próximo acesso agendar outro.
            log.exception("Falha ao agendar %s", ", ".join(job.key for job in jobs))

    async def aclose(self) -> None:
        # O AsyncQStash não expõe como fechar o próprio httpx.AsyncClient.
        await self._client.http._client.aclose()


async def get_job_queue() -> AsyncGenerator[JobQueue]:
    # Um client por requisição: o pool do httpx fica preso ao event loop que o abriu.
    queue = QStashQueue()
    try:
        yield queue
    finally:
        await queue.aclose()


JobQueueDep = Annotated[JobQueue, Depends(get_job_queue)]


async def get_job(request: Request, upstash_signature: Annotated[str, Header()]) -> Job:
    """O job entregue pelo QStash, depois de conferir a assinatura."""
    body = await request.body()
    try:
        _receiver().verify(
            signature=upstash_signature,
            body=body.decode(errors="replace"),
            url=JOBS_URL,
        )
    except SignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature"
        )

    try:
        return decode_job(body)
    except InvalidToken, ValidationError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid job"
        )


JobDep = Annotated[Job, Depends(get_job)]


def encode_job(job: Job) -> str:
    """O corpo da mensagem, cifrado: a Upstash não enxerga o token da sessão do SIGAA."""
    return _cipher().encrypt(job.model_dump_json().encode()).decode()


def decode_job(body: bytes) -> Job:
    return Job.model_validate_json(_cipher().decrypt(body))


def _deduplication_id(job: Job) -> str:
    """A mesma tarefa na mesma sessão, de novo em até 10 minutos, é descartada.

    Com a sessão na chave, um job descartado por `SessionExpired` não barra o
    da sessão nova. Em hash: o QStash recusa ':' (e o token vai cifrado).
    """
    return hashlib.sha256(f"{job.key}:{job.session_token}".encode()).hexdigest()


@cache
def _receiver() -> Receiver:
    return Receiver(
        current_signing_key=settings.qstash_current_signing_key,
        next_signing_key=settings.qstash_next_signing_key,
    )


@cache
def _cipher() -> Fernet:
    # Chave própria dos jobs, derivada do segredo que assina os cookies.
    return Fernet(base64.urlsafe_b64encode(derive_key("followw:jobs")))
