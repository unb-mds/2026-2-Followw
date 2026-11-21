from collections.abc import Iterable
from enum import StrEnum

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


LABELS = {
    Scope.PROFILE: "Ler nome, matrícula, foto e curso",
    Scope.PROFILE_WRITE: "Editar foto e bio no SIGAA",
    Scope.CLASSROOMS: "Ler turmas atuais e horários das aulas",
    Scope.HISTORY: "Consultar também turmas de semestres anteriores",
    Scope.GRADES: "Ler menções das turmas autorizadas, IRA e MP",
    Scope.MEMBERS: "Ver participantes das turmas e seus dados de contato",
    Scope.FREQUENCY: "Ler frequência e marcações pessoais",
    Scope.FREQUENCY_WRITE: "Alterar marcações pessoais de frequência",
    Scope.POSTS: "Ler posts e baixar materiais das turmas autorizadas",
    Scope.POST_MARKS: "Marcar postagens como lidas ou não lidas",
    Scope.TRANSCRIPT: "Baixar o histórico acadêmico completo",
    Scope.RU: "Consultar saldo e extrato do RU",
    Scope.INTERNSHIPS: "Consultar ofertas de estágio",
}

DEPENDENCIES = {
    Scope.PROFILE_WRITE: Scope.PROFILE,
    Scope.HISTORY: Scope.CLASSROOMS,
    Scope.GRADES: Scope.CLASSROOMS,
    Scope.FREQUENCY_WRITE: Scope.FREQUENCY,
    Scope.POST_MARKS: Scope.POSTS,
}


def granted_scopes(accepted: Iterable[str]) -> list[Scope]:
    scopes = {Scope(value) for value in accepted}
    if Scope.PROFILE not in scopes:
        raise ValueError("O perfil básico precisa estar entre os escopos concedidos.")
    for scope, required in DEPENDENCIES.items():
        if scope in scopes and required not in scopes:
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
