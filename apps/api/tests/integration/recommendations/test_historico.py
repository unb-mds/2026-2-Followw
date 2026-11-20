from sigaa_client import DocumentUnavailable, SigaaParseError

from api.db.models import User

from .helpers import codes

REFRESH = {"Cache-Control": "no-cache"}


def _me(scene):
    response = scene.client.get("/me", headers=REFRESH)
    assert response.status_code == 200, response.text
    return response.json()


def test_cumpridas_saem_das_recomendacoes_e_satisfazem_requisitos(scene, stub_sigaa):
    scene.subject("CUMPRIDA", kind="required")
    scene.subject("POSTERIOR", kind="required", prerequisites=[["CUMPRIDA"]])
    read = stub_sigaa.documents.get_completed_subjects
    read.side_effect = None
    read.return_value = {"CUMPRIDA", "FORA_DO_CATALOGO"}

    assert _me(scene)["completed_subjects"] == ["CUMPRIDA"]
    assert codes(scene.get()) == ["POSTERIOR"]


def test_historico_e_lido_uma_unica_vez(scene, stub_sigaa):
    scene.subject("A")
    read = stub_sigaa.documents.get_completed_subjects
    read.side_effect = None
    read.return_value = {"A"}
    _me(scene)

    read.return_value = set()
    assert _me(scene)["completed_subjects"] == ["A"]
    assert read.await_count == 1


def test_historico_indisponivel_e_tentado_de_novo(scene, stub_sigaa):
    scene.subject("A")
    read = stub_sigaa.documents.get_completed_subjects
    read.side_effect = DocumentUnavailable("Sem foto")
    assert _me(scene)["completed_subjects"] == []

    read.side_effect = None
    read.return_value = {"A"}
    assert _me(scene)["completed_subjects"] == ["A"]
    assert read.await_count == 2


def test_troca_de_matricula_apaga_e_le_o_historico_de_novo(scene, stub_sigaa):
    scene.subject("A")
    scene.subject("B")
    read = stub_sigaa.documents.get_completed_subjects
    read.side_effect = None
    read.return_value = {"A"}
    _me(scene)

    profile = stub_sigaa.profile.get_profile
    profile.return_value = profile.return_value.model_copy(
        update={"registration": "261000000"}
    )
    read.side_effect = DocumentUnavailable("Sem foto")
    assert _me(scene)["completed_subjects"] == []

    read.side_effect = None
    read.return_value = {"B"}
    assert _me(scene)["completed_subjects"] == ["B"]
    assert read.await_count == 3


async def test_troca_de_matricula_no_mesmo_curso_infere_a_matriz_de_novo(scene, assign):
    scene.user(curriculum_id=None)
    await assign()
    nova = scene.curriculum(code="100/2", valid_from="2024.1")
    await assign(registration="261000000", login="251000000")
    with scene.db() as session:
        assert session.get(User, scene.user_id).curriculum_id == nova


def test_historico_de_outra_matricula_e_ignorado(scene, stub_sigaa):
    scene.subject("A")
    read = stub_sigaa.documents.get_completed_subjects
    read.side_effect = SigaaParseError("Matrícula do histórico acadêmico não confere.")
    assert _me(scene)["completed_subjects"] == []

    read.side_effect = None
    read.return_value = {"A"}
    assert _me(scene)["completed_subjects"] == ["A"]
    read.assert_awaited_with("251000000")
