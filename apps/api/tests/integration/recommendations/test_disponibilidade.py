from sigaa_client import Grade
from sqlalchemy.dialects.postgresql import JSONB

from api.db.enums import ClassroomStatus
from api.db.models import Classroom, UserCompletedSubject

from .helpers import CATALOG_URL, codes


def _available(scene, **params):
    response = scene.client.get(
        CATALOG_URL, params={"offered": True, "available": True, **params}
    )
    assert response.status_code == 200, response.text
    return response.json()["items"]


def _full(scene, code, number="02"):
    with scene.db.begin() as session:
        session.add(
            Classroom(
                subject_code=code,
                number=number,
                semester="2026.2",
                vacancies=10,
                occupied=10,
            )
        )


def test_esconde_turmas_cheias_e_mantem_as_sem_numeros(scene):
    scene.subject("ABE0001")
    _full(scene, "ABE0001")
    scene.subject("CHE0001", offer=False)
    _full(scene, "CHE0001", "01")

    result = _available(scene, unit=673)
    assert codes(result) == ["ABE0001"]
    assert [room["number"] for room in result[0]["classrooms"]] == ["01"]


def test_pre_requisito_vale_por_aprovacao_historico_andamento_ou_equivalencia(scene):
    scene.history("APR0001", grade=Grade.MM, term="2025.2")
    scene.history("REP0001", grade=Grade.MI, term="2025.2")
    scene.history("CUR0001", enrolled=True)
    scene.history("TRA0001", status=ClassroomStatus.TRANCADO)
    scene.subject("CUM0001", offer=False)
    with scene.db.begin() as session:
        session.add(UserCompletedSubject(user_id=scene.user_id, subject_code="CUM0001"))
    scene.subject("EQV0001", offer=False, equivalences=[[], ["APR0001", "CUM0001"]])
    scene.subject("POR0001", prerequisites=[["APR0001"]])
    scene.subject("HIS0001", prerequisites=[["CUM0001", "APR0001"]])
    scene.subject("ALT0001", prerequisites=[["EQV0001"]])
    scene.subject("BLQ0001", prerequisites=[["REP0001"], ["EQV0001", "REP0001"]])
    scene.subject("LIV0001", prerequisites=[])
    scene.subject("SEG0001", prerequisites=[["CUR0001"]])
    scene.subject("TRC0001", prerequisites=[["TRA0001"]])

    assert codes(_available(scene, unit=673)) == [
        "ALT0001",
        "HIS0001",
        "LIV0001",
        "POR0001",
        "SEG0001",
    ]


def test_requisitos_com_json_null_contam_como_vazios(scene):
    scene.history("APR0001", grade=Grade.MM, term="2025.2")
    scene.subject(
        "NUL0001", prerequisites=JSONB.NULL, equivalences=JSONB.NULL, kind=None
    )

    assert codes(_available(scene, unit=673)) == ["NUL0001"]


def test_sem_available_lista_bloqueadas_e_cheias(scene):
    scene.subject("BLQ0001", prerequisites=[["NADA0001"]])
    _full(scene, "BLQ0001", "02")

    response = scene.client.get(CATALOG_URL, params={"offered": True, "unit": 673})
    (subject,) = response.json()["items"]
    assert [room["number"] for room in subject["classrooms"]] == ["01", "02"]


def test_recomendacoes_disponiveis_so_escondem_turmas_cheias(scene):
    scene.history("CUR0001", enrolled=True)
    scene.subject("ABE0001", kind="required", period=1)
    scene.subject("CHE0001", kind="required", period=1, offer=False)
    scene.subject("SEG0001", kind="required", period=1, prerequisites=[["CUR0001"]])
    _full(scene, "CHE0001", "01")

    assert codes(scene.get()) == ["ABE0001", "CHE0001", "SEG0001"]
    assert codes(scene.get(params={"available": True})) == ["ABE0001", "SEG0001"]


def test_busca_mista_repassa_available_para_as_materias(scene):
    scene.subject("ABE0001", name="Estatística aberta")
    scene.subject("CHE0001", name="Estatística cheia", offer=False)
    _full(scene, "CHE0001", "01")

    response = scene.client.get(
        "/public/search",
        params={"q": "estatistica", "type": "subjects", "available": True},
    )
    assert response.status_code == 200, response.text
    assert codes(response.json()["subjects"]["items"]) == ["ABE0001"]
