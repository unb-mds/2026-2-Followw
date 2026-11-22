from collections.abc import Iterable
from enum import StrEnum
from typing import Literal, NotRequired, TypedDict

from fastapi import HTTPException


class Scope(StrEnum):
    PROFILE = "profile:read"
    PROFILE_WRITE = "profile:write"
    CLASSROOMS = "classrooms:read"
    HISTORY = "classrooms:history"
    GRADES = "grades:read"
    MEMBERS = "members:read"
    FREQUENCY = "frequency:read"
    FREQUENCY_WRITE = "frequency:write"
    POSTS = "posts:read"
    POST_MARKS = "posts:mark"
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
        label="Ver participantes das turmas e seus dados de contato", trust_level="high"
    ),
    Scope.FREQUENCY: Permission(
        label="Ler frequência e marcações pessoais", trust_level="low"
    ),
    Scope.FREQUENCY_WRITE: Permission(
        label="Alterar marcações pessoais de frequência",
        trust_level="low",
        requires=Scope.FREQUENCY,
    ),
    Scope.POSTS: Permission(
        label="Ler posts e baixar materiais das turmas autorizadas",
        trust_level="medium",
    ),
    Scope.POST_MARKS: Permission(
        label="Marcar postagens como lidas ou não lidas",
        trust_level="low",
        requires=Scope.POSTS,
    ),
    Scope.TRANSCRIPT: Permission(
        label="Baixar o histórico acadêmico completo", trust_level="high"
    ),
    Scope.RU: Permission(label="Consultar saldo e extrato do RU", trust_level="medium"),
    Scope.INTERNSHIPS: Permission(
        label="Consultar ofertas de estágio", trust_level="low"
    ),
}


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
        "x-oauth-scope": scope.value,
        "security": [{"FollowwCookie": []}, {"OAuthBearer": []}],
        "responses": {
            "403": {"description": "O aplicativo não possui a permissão exigida."}
        },
    }


def insufficient_scope() -> HTTPException:
    return HTTPException(
        403,
        "Permissão OAuth insuficiente.",
        headers={"WWW-Authenticate": 'Bearer error="insufficient_scope"'},
    )
