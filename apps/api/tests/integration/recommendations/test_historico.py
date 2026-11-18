from sigaa_client import AcademicTranscript, DocumentUnavailable
from sqlalchemy import select

from api.db.models import UserCompletedSubject

from .helpers import URL, codes

REFRESH = {"Cache-Control": "no-cache"}


def _transcript(curriculum_code, completed, registration="251000000"):
    return AcademicTranscript(
        registration=registration, curriculum_code=curriculum_code, completed=completed
    )


def test_historico_define_matriz_e_exclui_componentes_cumpridos_das_recomendacoes(
    scene, stub_sigaa
):
    official = scene.curriculum(code="100/-2", active=False, sigaa_id=80)
    scene.subject("ANTIGA")
    scene.subject("APROVEITADA", kind=None)
    scene.subject("DISPENSADA", kind=None)
    scene.subject("ORIGEM", offer=False, kind=None)
    scene.subject("EQUIVALENTE", kind=None, equivalences=[["ORIGEM", "APROVEITADA"]])
    scene.subject("RECONHECIDA", kind=None)
    scene.subject(
        "TRANSITIVA", kind=None, equivalences=[["EQUIVALENTE"], ["RECONHECIDA"]]
    )
    scene.subject(
        "POSTERIOR", kind=None, prerequisites=[["EQUIVALENTE", "RECONHECIDA"]]
    )
    for code in (
        "APROVEITADA",
        "DISPENSADA",
        "EQUIVALENTE",
        "RECONHECIDA",
        "TRANSITIVA",
        "POSTERIOR",
    ):
        scene.component(code, matrix=official)
    sync = stub_sigaa.documents.get_transcript
    sync.side_effect = None
    sync.return_value = _transcript(
        "100/-2",
        {
            "APROVEITADA": "credit",
            "DISPENSADA": "waived",
            "ORIGEM": "approved",
            "RECONHECIDA": "equivalence",
            "FORA_DO_CATALOGO": "credit",
        },
    )

    response = scene.client.get("/me", headers=REFRESH)
    assert response.status_code == 200
    profile = response.json()
    assert profile["official_curriculum_code"] == "100/-2"
    assert profile["curriculum_sigaa_id"] == 80
    assert profile["completed_subjects"] == {
        "APROVEITADA": "credit",
        "DISPENSADA": "waived",
        "EQUIVALENTE": "equivalence",
        "RECONHECIDA": "equivalence",
    }
    assert set(codes(scene.get())) == {"POSTERIOR", "TRANSITIVA"}
    scene.client.get("/me", headers=REFRESH).raise_for_status()
    with scene.db() as session:
        stored = session.scalars(
            select(UserCompletedSubject.subject_code).where(
                UserCompletedSubject.user_id == scene.user_id
            )
        ).all()
        assert sorted(stored) == ["APROVEITADA", "DISPENSADA", "ORIGEM", "RECONHECIDA"]


def test_sincronizacao_preserva_historico_indisponivel_e_substitui_por_documento_valido(
    scene, stub_sigaa
):
    scene.subject("A")
    scene.subject("B", kind=None, equivalences=[["A", "C"]])
    scene.component("B")
    sync = stub_sigaa.documents.get_transcript
    sync.side_effect = None
    sync.return_value = _transcript("100/1", {"A": "credit"})
    assert codes(scene.get(headers=REFRESH)) == ["B"]

    sync.side_effect = DocumentUnavailable("Sem foto")
    profile = scene.client.get("/me", headers=REFRESH).json()
    assert profile["completed_subjects"] == {"A": "credit"}

    sync.side_effect = None
    sync.return_value = _transcript("100/1", {}, registration="999999999")
    profile = scene.client.get("/me", headers=REFRESH).json()
    assert profile["completed_subjects"] == {"A": "credit"}

    sync.return_value = _transcript("100/1", {})
    profile = scene.client.get("/me", headers=REFRESH).json()
    assert profile["completed_subjects"] == {}
    assert set(codes(scene.get())) == {"A", "B"}


def test_matriz_oficial_fora_do_catalogo_nao_e_trocada_pela_estimada(scene, stub_sigaa):
    sync = stub_sigaa.documents.get_transcript
    sync.side_effect = None
    sync.return_value = _transcript("999/2", {})
    profile = scene.client.get("/me", headers=REFRESH).json()
    assert profile["official_curriculum_code"] == "999/2"
    assert profile["curriculum_sigaa_id"] is None
    assert scene.client.get(URL).status_code == 422
