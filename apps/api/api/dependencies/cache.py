from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, Header, Response

# `stale-if-error` sem valor aceita cache de qualquer idade.
_ANY_AGE = timedelta.max


@dataclass(frozen=True)
class CacheControl:
    no_cache: bool = False
    max_age: timedelta | None = None
    stale_if_error: timedelta | None = None
    only_if_cached: bool = False
    response: Response | None = field(default=None, compare=False, repr=False)

    @classmethod
    def parse(
        cls, header: str | None, response: Response | None = None
    ) -> CacheControl:
        """Diretivas desconhecidas ou com valor inválido são ignoradas."""
        directives: dict[str, str | None] = {}
        for part in (header or "").split(","):
            name, _, value = part.partition("=")
            if name.strip():
                directives[name.strip().lower()] = value.strip().strip('"') or None

        stale_if_error = None
        if "stale-if-error" in directives:
            stale_if_error = _seconds(directives["stale-if-error"]) or _ANY_AGE
        return cls(
            no_cache="no-cache" in directives,
            max_age=_seconds(directives.get("max-age")),
            stale_if_error=stale_if_error,
            only_if_cached="only-if-cached" in directives,
            response=response,
        )

    def revalidate(self, synced_at: datetime) -> bool:
        if self.no_cache:
            return True
        return self.max_age is not None and age(synced_at) >= self.max_age

    def accepts_stale(self, synced_at: datetime) -> bool:
        return self.stale_if_error is not None and age(synced_at) <= self.stale_if_error

    def served(self, synced_at: datetime) -> None:
        if self.response is None:
            return
        seconds = int(age(synced_at).total_seconds())
        current = int(self.response.headers.get("age", 0))
        self.response.headers["Age"] = str(max(seconds, current, 0))


# Requisição sem `Cache-Control`: segue só os TTLs do servidor.
NO_DIRECTIVES = CacheControl()


def _seconds(value: str | None) -> timedelta | None:
    if value is None or not value.isdigit():
        return None
    return timedelta(seconds=int(value))


def age(synced_at: datetime) -> timedelta:
    if synced_at.tzinfo is None:
        synced_at = synced_at.replace(tzinfo=UTC)
    return datetime.now(UTC) - synced_at


def get_cache_control(
    response: Response,
    cache_control: Annotated[
        str | None,
        Header(
            alias="Cache-Control",
            description=(
                "`no-cache` (ou `max-age=0`) busca na origem antes de responder; "
                "`max-age=N` aceita cache de até N s; `stale-if-error[=N]` devolve "
                "o cache se a origem falhar; `only-if-cached` nunca busca (504 sem cache)."
            ),
        ),
    ] = None,
) -> CacheControl:
    response.headers["Cache-Control"] = "private, no-cache"
    return CacheControl.parse(cache_control, response)


def no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


CacheControlDep = Annotated[CacheControl, Depends(get_cache_control)]
NoStore = Depends(no_store)
