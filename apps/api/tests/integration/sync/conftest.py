import pytest

from .helpers import (
    ANTIGA,
    ATUAL,
    COLEGA,
    CREDENCIAIS,
    FATIA,
)


@pytest.fixture
def conta(stub_sigaa):
    stub_sigaa.classrooms.list_classrooms.return_value = [ATUAL, ANTIGA]
    stub_sigaa.classrooms.list_classroom_members.return_value = [COLEGA]
    stub_sigaa.classrooms.get_classroom_statistics.return_value = (FATIA,)
    return stub_sigaa


@pytest.fixture
def logado(client, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    return client


@pytest.fixture
def turma(client, stub_sigaa, cookies, qstash, database):
    """Usuário com a turma AAA no cache e nenhum job pendente."""
    stub_sigaa.classrooms.list_classrooms.return_value = [ATUAL]
    stub_sigaa.classrooms.get_classroom_statistics.return_value = (FATIA,)
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    assert client.get("/classrooms").status_code == 200
    client.cookies.clear()
    qstash.published.clear()
    stub_sigaa.reset()
    return stub_sigaa
