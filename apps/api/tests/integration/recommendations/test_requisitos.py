import pytest
from sigaa_client import (
    Grade,
)

from api.db.models import (
    Classroom,
    User,
)

from .helpers import (
    URL,
)


@pytest.mark.parametrize("search", [True, False])
def test_exibicao_de_requisitos_seleciona_alternativas_completas_da_matriz(
    scene, search
):
    scene.subject("A", offer=False, kind="required")
    scene.subject("B", offer=False, kind="optional")
    scene.subject("OLD", kind=None)
    groups = [["OLD"], ["A", "B"], ["A", "OLD"]]
    scene.subject(
        "FGA0999", prerequisites=groups, corequisites=groups, equivalences=[["OTHER"]]
    )
    scene.history("OLD", grade=Grade.MM)
    # A aprovação fora da matriz continua liberando a recomendação.
    if search:
        response = scene.client.get(URL, params={"code": "FGA0999"})
        assert response.status_code == 200
        item = response.json()[0]
    else:
        item = next(item for item in scene.get() if item["code"] == "FGA0999")
    for field in ("prerequisites", "corequisites"):
        assert [[r["code"] for r in g] for g in item[field]] == groups
        selected = item[f"curriculum_{field}"]
        assert [[r["code"] for r in g] for g in selected] == [["A", "B"]]
    assert item["equivalences"][0][0]["code"] == "OTHER"
    assert item["offered_equivalences"] == []


@pytest.mark.parametrize("field", ["prerequisites", "corequisites"])
@pytest.mark.parametrize("semester", [None, "2026.1", "2026.2"])
def test_sem_requisito_da_matriz_exibe_apenas_alternativas_com_oferta_no_semestre(
    scene, field, semester
):
    scene.subject("NEW", kind=None)
    scene.subject("OLD", offer=False, kind=None)
    scene.subject("MISSING", offer=False, kind=None)
    with scene.db.begin() as session:
        session.add(Classroom(subject_code="OLD", number="01", semester="2026.1"))
        session.add(
            Classroom(
                subject_code="NEW",
                number="02",
                semester="2026.2",
                vacancies=10,
                occupied=10,
            )
        )
    groups = [["OLD"], ["NEW"], ["NEW", "MISSING"]]
    scene.subject("FGA0999", **{field: groups})
    params = {"code": "FGA0999"}
    if semester:
        params["semester"] = semester
    response = scene.client.get(URL, params=params)
    assert response.status_code == 200
    item = response.json()[0]
    expected = "OLD" if semester == "2026.1" else "NEW"
    assert [[r["code"] for r in g] for g in item[f"curriculum_{field}"]] == [[expected]]
    assert [[r["code"] for r in g] for g in item[field]] == groups


def test_recomendacoes_usam_ofertas_do_semestre_quando_requisitos_nao_estao_na_matriz(
    scene,
):
    scene.subject("OLD", kind=None)
    scene.subject("MISSING", offer=False, kind=None)
    scene.subject(
        "FGA0999", prerequisites=[["OLD"], ["MISSING"]], corequisites=[["OLD"]]
    )
    scene.history("OLD", grade=Grade.MM)
    item = next(item for item in scene.get() if item["code"] == "FGA0999")
    assert item["curriculum_prerequisites"][0][0]["code"] == "OLD"
    assert item["curriculum_corequisites"][0][0]["code"] == "OLD"


def test_requisitos_sem_alternativa_da_matriz_nem_oferta_retornam_lista_vazia(scene):
    scene.subject("A", offer=False)
    scene.subject("OLD", offer=False, kind=None)
    scene.subject("FGA0999", prerequisites=[["A", "OLD"]], corequisites=[["OLD"]])
    response = scene.client.get(URL, params={"code": "FGA0999"})
    assert response.status_code == 200
    item = response.json()[0]
    assert item["curriculum_prerequisites"] == []
    assert item["curriculum_corequisites"] == []
    assert item["prerequisites"][0][1]["code"] == "OLD"


@pytest.mark.parametrize("visitor", [True, False])
def test_sem_curriculo_identificado_os_requisitos_completos_continuam_disponiveis(
    scene, visitor
):
    scene.subject("OLD", offer=False, kind=None)
    scene.subject("FGA0999", prerequisites=[["OLD"]], corequisites=[["OLD"]])
    if visitor:
        scene.client.cookies.clear()
    else:
        scene.user(curriculum_id=None)
    response = scene.client.get(URL, params={"code": "FGA0999"})
    assert response.status_code == 200
    item = response.json()[0]
    for field in ("prerequisites", "corequisites"):
        assert item[field][0][0]["code"] == "OLD"
        assert item[f"curriculum_{field}"] is None


def test_visitante_sem_filtros_e_rejeitado(api):
    assert api.get(URL).status_code == 422


def test_filtros_mantem_a_busca_comum(scene, stub_sigaa):
    scene.subject("A")
    (item,) = scene.client.get(URL, params={"unit": "673"}).json()
    assert item["recommendation"] is None
    stub_sigaa.profile.get_profile.assert_not_awaited()


def test_busca_comum_mostra_o_tipo_na_matriz_pelo_cache(scene, stub_sigaa):
    scene.subject("REQ", kind="required", period=1)
    scene.subject("OPT", kind="optional")
    scene.subject("COMP", kind="complementary")
    scene.subject("FREE", kind=None)
    result = scene.client.get(URL, params={"unit": "673"}).json()
    assert {i["code"]: i["kind"] for i in result} == {
        "COMP": "optional",
        "FREE": "free",
        "OPT": "optional",
        "REQ": "mandatory",
    }
    stub_sigaa.profile.get_profile.assert_not_awaited()
    stub_sigaa.classrooms.list_classrooms.assert_not_awaited()
    assert {i["code"]: i["kind"] for i in scene.get()} == {
        "REQ": "mandatory",
        "COMP": "optional",
        "OPT": "optional",
    }


@pytest.mark.parametrize("period", [1, 5, 0, None])
def test_busca_e_recomendacoes_informam_apenas_semestre_positivo_do_fluxo(
    scene, period
):
    scene.subject("REQ", kind="required", period=period)
    scene.subject("FREE", kind=None)
    for params in ({"unit": "673"}, {}):
        items = {
            item["code"]: item for item in scene.client.get(URL, params=params).json()
        }
        assert items["REQ"]["curriculum_period"] == (
            period if period and period > 0 else None
        )
        if params:
            assert items["FREE"]["curriculum_period"] is None
    scene.user(curriculum_id=None)
    assert all(
        item["curriculum_period"] is None
        for item in scene.client.get(URL, params={"unit": "673"}).json()
    )
    scene.client.cookies.clear()
    assert all(
        item["curriculum_period"] is None
        for item in scene.client.get(URL, params={"unit": "673"}).json()
    )


def test_tipo_e_nulo_sem_matriz_ou_sem_login(scene):
    scene.subject("A")
    with scene.db.begin() as session:
        user = session.get(User, scene.user_id)
        user.course_id = user.curriculum_id = None

    def kinds():
        return [i["kind"] for i in scene.client.get(URL, params={"unit": "673"}).json()]

    assert kinds() == [None]
    scene.client.cookies.clear()
    assert kinds() == [None]
