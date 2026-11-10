import pytest

from api.db.models import (
    Curriculum,
    User,
)

from .helpers import (
    URL,
    codes,
)


async def test_selecao_de_matriz_por_turno_revisao_e_entrada(scene, assign):
    scene.subject("A", kind=None)
    scene.curriculum(code="100/2", valid_from="2024.1", sigaa_id=12)
    selected = scene.curriculum(code="100/3", valid_from="2024.1", sigaa_id=13)
    scene.curriculum(code="100/3", valid_from="2024.1", sigaa_id=11)
    scene.curriculum(code="100/99", valid_from="2024.1", shift="N")
    scene.curriculum(code="100/99", valid_from="2024.1", active=False)
    scene.curriculum(code="100/99", valid_from="2027.1")
    scene.curriculum(code="100/4", valid_from="2026.1")
    scene.user(curriculum_id=None)
    await assign()
    assert scene.get() == []
    scene.component("A", kind="optional", matrix=selected)
    assert codes(scene.get()) == ["A"]


async def test_entrada_antiga_e_turno_desconhecido_tem_alternativa(scene, assign):
    scene.subject("A", kind=None)
    scene.user(curriculum_id=None)
    with scene.db.begin() as session:
        session.get(Curriculum, scene.matrix).shift = "N"
    fallback = scene.curriculum(shift=None, valid_from="2024.1")
    scene.component("A", kind="optional", matrix=fallback)
    await assign(entry="2010.1")
    assert codes(scene.get()) == ["A"]


@pytest.mark.parametrize("mode", ["opposite_shift", "other_course", "no_entry"])
async def test_sem_matriz_recomendacoes_sao_rejeitadas(scene, assign, mode):
    scene.subject("A", kind="required", period=None)
    scene.user(curriculum_id=None)
    entry, course = "2025.1", "ENGENHARIA DE SOFTWARE"
    if mode == "opposite_shift":
        with scene.db.begin() as session:
            session.get(Curriculum, scene.matrix).shift = "N"
    elif mode == "other_course":
        course = "OUTRO CURSO"
    else:
        entry = None
    await assign(entry=entry, course=course)
    assert scene.client.get(URL).status_code == 422


def test_sem_matriz_a_busca_comum_continua_funcionando(scene, stub_sigaa):
    scene.subject("A")
    scene.user(curriculum_id=None)
    (item,) = scene.client.get(URL, params={"unit": "673"}).json()
    assert item["kind"] is None
    stub_sigaa.classrooms.list_classrooms.assert_not_awaited()


async def test_matriz_e_inferida_so_enquanto_nula(scene, assign):
    scene.curriculum(valid_from="2024.1")
    scene.user(curriculum_id=None)
    await assign(entry="2020.1")
    await assign(entry="2025.1")
    with scene.db.begin() as session:
        assert session.get(User, scene.user_id).curriculum_id == scene.matrix


async def test_sync_do_perfil_zera_a_matriz_so_quando_o_curso_muda(scene, assign):
    def curriculum_id():
        with scene.db.begin() as session:
            return session.get(User, scene.user_id).curriculum_id

    await assign()
    assert curriculum_id() == scene.matrix
    await assign(course="OUTRO CURSO")
    assert curriculum_id() is None
