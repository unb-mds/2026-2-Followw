from datetime import datetime

from sigaa_client import Credentials

from api.modules.classrooms.service import ParticipantClassroom
from api.modules.classrooms.week import WeekLesson
from api.modules.me.profile import UserProfile
from api.modules.oauth.scopes import Scope


def _marcados(modelo, escopo):
    propriedades = modelo.model_json_schema(mode="serialization")["properties"]
    return {
        nome
        for nome, schema in propriedades.items()
        if schema.get("x-oauth-scope") == escopo.value
    }


def _web(client, cookies, rota):
    credenciais = Credentials(registration="251000000", password="senha123")
    client.cookies.update(cookies(refresh=credenciais))
    client.get(rota)
    corpo = client.get(rota).json()
    client.cookies.clear()
    return corpo


def _oauth(client, emitir, rota, *escopos):
    token = emitir(*escopos).access_token
    return client.get(rota, headers={"Authorization": f"Bearer {token}"}).json()


def test_campos_marcados_no_openapi_sao_os_que_o_recorte_omite_nas_turmas(
    client, emitir, cookies, turmas
):
    completo = _web(client, cookies, "/classrooms")[0]
    parcial = _oauth(client, emitir, "/classrooms", Scope.CLASSROOMS)[0]
    omitidos = set(completo) - set(parcial)
    assert omitidos == _marcados(ParticipantClassroom, Scope.GRADES) == {"grade"}


def test_campos_marcados_no_openapi_sao_os_que_o_recorte_omite_nas_aulas(
    client, emitir, cookies, turmas, hoje
):
    hoje(datetime(2026, 9, 17, 15))

    def aula(corpo):
        return next(l for dia in corpo for l in dia["lessons"])

    completa = aula(_web(client, cookies, "/lessons"))
    parcial = aula(_oauth(client, emitir, "/lessons", Scope.CLASSROOMS))
    omitidos = set(completa) - set(parcial)
    assert omitidos == _marcados(WeekLesson, Scope.FREQUENCY) == {"status", "marked"}


def test_campos_marcados_no_openapi_sao_os_que_o_recorte_omite_no_perfil(
    client, emitir, stub_sigaa
):
    basico = _oauth(client, emitir, "/me")
    com_indices = _oauth(client, emitir, "/me", Scope.CLASSROOMS, Scope.GRADES)
    assert set(com_indices) - set(basico) == _marcados(UserProfile, Scope.GRADES)
    assert _marcados(UserProfile, Scope.GRADES) == {"ira", "mp"}
