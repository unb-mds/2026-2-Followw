from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Literal, NotRequired, TypedDict

from fastapi import HTTPException, Request
from pydantic import Field

_SCOPE_KEY = "x-oauth-scope"


class Scope(StrEnum):
    PROFILE = "profile:read"
    PROFILE_WRITE = "profile:write"
    CLASSROOMS = "classrooms:read"
    HISTORY = "classrooms.history:read"
    GRADES = "grades:read"
    MEMBERS = "classrooms.members:read"
    FREQUENCY = "classrooms.frequency:read"
    FREQUENCY_WRITE = "classrooms.frequency:write"
    POSTS = "classrooms.posts:read"
    TRANSCRIPT = "transcript:read"
    RU = "ru:read"
    INTERNSHIPS = "internships:read"


class Permission(TypedDict):
    label: str
    trust_level: Literal["low", "medium", "high"]
    requires: NotRequired[Scope]


PERMISSIONS: dict[Scope, Permission] = {
    Scope.PROFILE: Permission(
        label="Ler nome, matrícula, foto e curso", trust_level="low"
    ),
    Scope.PROFILE_WRITE: Permission(
        label="Editar foto e bio no SIGAA", trust_level="high", requires=Scope.PROFILE
    ),
    Scope.CLASSROOMS: Permission(
        label="Ler turmas atuais e horários das aulas", trust_level="medium"
    ),
    Scope.HISTORY: Permission(
        label="Consultar também turmas de semestres anteriores",
        trust_level="medium",
        requires=Scope.CLASSROOMS,
    ),
    Scope.GRADES: Permission(
        label="Ler menções das turmas autorizadas, IRA e MP",
        trust_level="high",
        requires=Scope.CLASSROOMS,
    ),
    Scope.MEMBERS: Permission(
        label="Ver participantes das turmas e seus dados de contato",
        trust_level="high",
        requires=Scope.CLASSROOMS,
    ),
    Scope.FREQUENCY: Permission(
        label="Ler frequência e marcações pessoais",
        trust_level="low",
        requires=Scope.CLASSROOMS,
    ),
    Scope.FREQUENCY_WRITE: Permission(
        label="Alterar marcações pessoais de frequência",
        trust_level="low",
        requires=Scope.FREQUENCY,
    ),
    Scope.POSTS: Permission(
        label="Ler posts e baixar materiais das turmas autorizadas",
        trust_level="medium",
        requires=Scope.CLASSROOMS,
    ),
    Scope.TRANSCRIPT: Permission(
        label="Baixar o histórico acadêmico completo", trust_level="high"
    ),
    Scope.RU: Permission(label="Consultar saldo e extrato do RU", trust_level="medium"),
    Scope.INTERNSHIPS: Permission(
        label="Consultar ofertas de estágio", trust_level="low"
    ),
}


@dataclass(frozen=True)
class AccessPolicy:
    """Permissões da requisição; `scopes=None` representa a sessão web completa."""

    scopes: frozenset[Scope] | None = None

    @property
    def delegated(self) -> bool:
        return self.scopes is not None

    def allows(self, scope: Scope) -> bool:
        return self.scopes is None or scope in self.scopes

    def require(self, scope: Scope) -> None:
        if not self.allows(scope):
            raise insufficient_scope()


FULL_ACCESS = AccessPolicy()


def granted_scopes(accepted: Iterable[str]) -> list[Scope]:
    scopes = {Scope(value) for value in accepted}
    if Scope.PROFILE not in scopes:
        raise ValueError("O perfil básico precisa estar entre os escopos concedidos.")
    for scope in scopes:
        required = PERMISSIONS[scope].get("requires")
        if required is not None and required not in scopes:
            raise ValueError(f"{scope} exige {required}.")
    return sorted(scopes)


def oauth(scope: Scope) -> dict:
    return {
        _SCOPE_KEY: scope.value,
        "security": [{"FollowwCookie": []}, {"OAuthBearer": []}],
        "responses": {
            "403": {"description": "O aplicativo não possui a permissão exigida."}
        },
    }


def scoped(scope: Scope, description: str, **field: Any) -> Any:
    """Campo que o OAuth só devolve com o escopo; o OpenAPI o marca com `x-oauth-scope`."""
    return Field(
        description=f"{description} Com OAuth, exige `{scope}`.",
        json_schema_extra={_SCOPE_KEY: scope.value},
        **field,
    )


def route_scope(request: Request) -> Scope | None:
    route = request.scope.get("route")
    raw = (getattr(route, "openapi_extra", None) or {}).get(_SCOPE_KEY)
    return Scope(raw) if raw is not None else None


def insufficient_scope() -> HTTPException:
    return HTTPException(
        403,
        "Permissão OAuth insuficiente.",
        headers={"WWW-Authenticate": 'Bearer error="insufficient_scope"'},
    )
