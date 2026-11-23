from uuid import uuid4

import pytest
from sigaa_client import StatisticsShare, StudentSituation
from sqlalchemy.orm import undefer

from api.db.models import Classroom as ClassroomModel
from api.modules.classrooms.repository import ClassroomRepository

from .helpers import AGORA, CREDENCIAIS, _salvar_turmas, _turma, _vinculos


async def test_estatisticas_substituem_as_anteriores(
    async_database, usuarios, id_da_turma
):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id

    for shares in (
        [StatisticsShare(situation=StudentSituation.MATRICULADO, percentage=100)],
        [
            StatisticsShare(situation=StudentSituation.APROVADO, percentage=90),
            StatisticsShare(situation=StudentSituation.MATRICULADO, percentage=10),
        ],
    ):
        async with async_database() as session:
            await ClassroomRepository(session).save_statistics(
                classroom_id, shares, AGORA
            )
            await session.commit()

    async with async_database() as session:
        classroom = await session.get_one(
            ClassroomModel, classroom_id, options=[undefer(ClassroomModel.statistics)]
        )
    assert sorted((s["situation"], s["percentage"]) for s in classroom.statistics) == [
        ("aprovado", 90),
        ("matriculado", 10),
    ]
    assert classroom.statistics_synced_at is not None

    async with async_database() as session:
        await ClassroomRepository(session).save_statistics(classroom_id, [], AGORA)
        await session.commit()
        classroom = await session.get_one(
            ClassroomModel, classroom_id, options=[undefer(ClassroomModel.statistics)]
        )
        assert classroom.statistics == []


def test_estatisticas_da_turma_saem_do_cache_do_login(
    client, sigaa, turmas, id_da_turma
):
    client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    chamadas = turmas.classrooms.get_classroom_statistics.await_count
    response = client.get(f"/classrooms/{id_da_turma('BBB')}/statistics")
    assert response.status_code == 200
    assert response.json() == [
        {"situation": "matriculado", "percentage": 10},
        {"situation": "aprovado", "percentage": 90},
    ]
    assert turmas.classrooms.get_classroom_statistics.await_count == chamadas


def test_estatisticas_sem_cache_buscam_apenas_a_turma_pedida(
    client, turmas, cookies, id_da_turma
):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    client.get("/classrooms")
    response = client.get(f"/classrooms/{id_da_turma('BBB')}/statistics")
    assert response.status_code == 200
    assert len(response.json()) == 2
    turmas.classrooms.get_classroom_statistics.assert_awaited_once_with("BBB")


def test_estatisticas_de_turma_alheia_retornam_404(client, turmas, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    assert client.get("/classrooms/ALHEIA/statistics").status_code == 404
    turmas.classrooms.get_classroom_statistics.assert_not_awaited()


@pytest.mark.parametrize("front_end_id", ["AAA", "BBB"])
def test_estatisticas_indisponiveis_retornam_lista_vazia(
    client, turmas, cookies, front_end_id, id_da_turma
):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    client.get("/classrooms")
    turmas.classrooms.get_classroom_statistics.return_value = []
    response = client.get(f"/classrooms/{id_da_turma(front_end_id)}/statistics")
    assert response.status_code == 200
    assert response.json() == []


def test_estatisticas_exigem_autenticacao(api):
    assert api.get(f"/classrooms/{uuid4()}/statistics").status_code == 401
