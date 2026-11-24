from typing import Annotated
from urllib.parse import parse_qsl, urlsplit
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import (
    AfterValidator,
    AnyHttpUrl,
    BaseModel,
    Field,
    StringConstraints,
    model_validator,
)

from api.cache import NoStore
from api.db.main import DatabaseDep
from api.db.models import OAuthApplication
from api.modules.oauth.applications import (
    MAX_REDIRECT_URI_LENGTH,
    ApplicationRepository,
)
from api.modules.oauth.auth import WEB_SECURITY, WebSessionDep

_MAX_REDIRECT_URIS = 10
_LOOPBACK = {"localhost", "127.0.0.1", "::1"}

router = APIRouter(prefix="/applications", dependencies=[NoStore])


def _redirect_uri(value: str) -> str:
    if any(ord(c) < 33 or ord(c) > 126 for c in value) or any(
        c in value for c in ("#", "\\", "*")
    ):
        raise ValueError("URI de redirecionamento inválida.")
    try:
        uri = urlsplit(value)
        parsed = AnyHttpUrl(value)
    except ValueError:
        raise ValueError("URI de redirecionamento inválida.") from None
    if (
        not uri.hostname
        or uri.username is not None
        or parsed.port == 0
        or not (
            uri.scheme == "https"
            or (uri.scheme == "http" and uri.hostname in _LOOPBACK)
        )
    ):
        raise ValueError("Use uma URI HTTPS ou HTTP local, sem credenciais.")
    if any(
        key in {"code", "error", "state"}
        for key, _ in parse_qsl(uri.query, keep_blank_values=True)
    ):
        raise ValueError("A URI usa parâmetros reservados pelo OAuth.")
    return value


def _unique_uris(uris: list[str]) -> list[str]:
    if len(set(uris)) != len(uris):
        raise ValueError("As URIs de redirecionamento devem ser distintas.")
    return uris


Name = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=100,
        pattern=r"^[^\x00-\x1F\x7F]+$",
    ),
]
RedirectURI = Annotated[
    str,
    StringConstraints(min_length=1, max_length=MAX_REDIRECT_URI_LENGTH),
    AfterValidator(_redirect_uri),
]
RedirectURIs = Annotated[
    list[RedirectURI],
    Field(min_length=1, max_length=_MAX_REDIRECT_URIS),
    AfterValidator(_unique_uris),
]


class ApplicationCreate(BaseModel):
    name: Name
    redirect_uris: RedirectURIs


class ApplicationUpdate(BaseModel):
    name: Name | None = None
    redirect_uris: RedirectURIs | None = None

    @model_validator(mode="after")
    def validate_patch(self) -> ApplicationUpdate:
        if not self.model_fields_set or any(
            getattr(self, field) is None for field in self.model_fields_set
        ):
            raise ValueError("Informe ao menos um campo válido para editar.")
        return self


class Application(BaseModel):
    client_id: UUID
    name: str
    redirect_uris: list[str]

    @classmethod
    def from_row(cls, row: OAuthApplication) -> Application:
        return cls(client_id=row.id, name=row.name, redirect_uris=row.redirect_uris)


class ClientSecret(BaseModel):
    client_secret: str = Field(repr=False)


class ApplicationCreated(Application, ClientSecret):
    pass


class ApplicationsPage(BaseModel):
    items: list[Application]
    next_cursor: UUID | None


def _not_found() -> HTTPException:
    return HTTPException(
        404, "Aplicação não encontrada.", headers={"Cache-Control": "no-store"}
    )


@router.post(
    "",
    status_code=201,
    summary="Cadastrar uma aplicação OAuth",
    openapi_extra=WEB_SECURITY,
)
async def create_application(
    body: ApplicationCreate, session: WebSessionDep, db: DatabaseDep
) -> ApplicationCreated:
    row, secret = await db.write(
        lambda conn: ApplicationRepository(conn).create(
            session.registration, body.name, body.redirect_uris
        )
    )
    return ApplicationCreated(
        client_id=row.id,
        name=row.name,
        redirect_uris=row.redirect_uris,
        client_secret=secret,
    )


@router.get(
    "", summary="Listar aplicações do desenvolvedor", openapi_extra=WEB_SECURITY
)
async def list_applications(
    session: WebSessionDep,
    db: DatabaseDep,
    cursor: UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> ApplicationsPage:
    rows = await db.read(
        lambda conn: ApplicationRepository(conn).list_owned(
            session.registration, before=cursor, limit=limit + 1
        )
    )
    return ApplicationsPage(
        items=[Application.from_row(row) for row in rows[:limit]],
        next_cursor=rows[limit - 1].id if len(rows) > limit else None,
    )


@router.patch(
    "/{client_id}", summary="Editar uma aplicação OAuth", openapi_extra=WEB_SECURITY
)
async def update_application(
    client_id: UUID, body: ApplicationUpdate, session: WebSessionDep, db: DatabaseDep
) -> Application:
    row = await db.write(
        lambda conn: ApplicationRepository(conn).update_owned(
            session.registration, client_id, **body.model_dump(exclude_unset=True)
        )
    )
    if row is None:
        raise _not_found()
    return Application.from_row(row)


@router.post(
    "/{client_id}/rotate-secret",
    summary="Rotacionar o segredo da aplicação",
    openapi_extra=WEB_SECURITY,
)
async def rotate_application_secret(
    client_id: UUID, session: WebSessionDep, db: DatabaseDep
) -> ClientSecret:
    secret = await db.write(
        lambda conn: ApplicationRepository(conn).rotate(session.registration, client_id)
    )
    if secret is None:
        raise _not_found()
    return ClientSecret(client_secret=secret)


@router.delete(
    "/{client_id}",
    status_code=204,
    summary="Remover uma aplicação OAuth",
    openapi_extra=WEB_SECURITY,
)
async def delete_application(
    client_id: UUID, session: WebSessionDep, db: DatabaseDep
) -> None:
    removed = await db.write(
        lambda conn: ApplicationRepository(conn).delete(session.registration, client_id)
    )
    if not removed:
        raise _not_found()
