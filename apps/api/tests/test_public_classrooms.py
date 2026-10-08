import asyncio
import json
import logging
import runpy
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
import respx
from sigaa_client import PublicClassroom, SigaaParseError, Subject, Unit
from sigaa_client.config import PUBLIC_CLASSROOMS_PATH, PUBLIC_HOME_PATH

from api.db.main import get_sessionmaker
from api.modules.public_classrooms import service as public_classroom
from api.modules.public_classrooms.service import _code_index
from api.sync.queue import get_job_queue

SEARCH_FORM = """
<form id="formTurma" method="post" action="/sigaa/public/turmas/listar.jsf">
  <input name="formTurma" value="formTurma" type="hidden" />
  <select name="formTurma:inputNivel">
    <option value="">-- SELECIONE --</option><option value="G">GRADUAÇÃO</option>
  </select>
  <select name="formTurma:inputDepto">
    <option value="0">-- SELECIONE --</option>
    <option value="672">CAMPUS UNB CEILÂNDIA</option>
    <option value="673">CAMPUS UNB GAMA</option>
  </select>
  <input name="formTurma:inputAno" value="2031" />
  <select name="formTurma:inputPeriodo">
    <option value="1">1</option><option value="2">2</option>
    <option value="4" selected="selected">4</option>
  </select>
  <input type="submit" name="formTurma:buscar" value="Buscar" />
  <input name="javax.faces.ViewState" value="view-publica" type="hidden" />
</form>
"""
RESULTS = """
<table class="listagem">
  <tr class="agrupador"><td colspan="8">
    <span class="tituloDisciplina">FGA0030 - ESTRUTURAS DE DADOS 2</span>
  </td></tr>
  <tr class="linhaPar">
    <td>01</td><td>2031.4</td><td>DOCENTE (60h)</td><td>24T23</td>
    <td></td><td>50</td><td>30</td><td>FCTE - S3</td>
  </tr>
</table>
"""


class FakePublicSigaa:
    def __init__(self):
        self.form = SEARCH_FORM
        self.result = RESULTS
        self.results_by_unit = {}
        self.paths = []
        self.payloads = []
        self.warm = False
        self.status = 200

    def __call__(self, request):
        self.paths.append(request.url.path)
        if request.url.path == PUBLIC_HOME_PATH:
            self.warm = True
            return httpx.Response(self.status, text="home")
        assert request.url.path == PUBLIC_CLASSROOMS_PATH
        if request.method == "GET":
            return httpx.Response(self.status, text=self.form)
        assert self.warm
        payload = dict(httpx.QueryParams(request.content.decode()))
        assert payload["javax.faces.ViewState"] == "view-publica"
        self.payloads.append(payload)
        return httpx.Response(
            self.status,
            text=self.results_by_unit.get(payload["formTurma:inputDepto"], self.result),
        )


@pytest.fixture
def public_sigaa():
    fake = FakePublicSigaa()
    with respx.mock:
        respx.route(host="sigaa.unb.br").mock(side_effect=fake)
        yield fake


@pytest.mark.parametrize("unit", ["673", "gama", "  GAMA  "])
def test_busca_publica_sem_login_preserva_defaults_do_sigaa(client, public_sigaa, unit):
    def dependency_proibida():
        pytest.fail("Busca pública não deve usar banco ou fila")

    client.app.dependency_overrides[get_sessionmaker] = dependency_proibida
    client.app.dependency_overrides[get_job_queue] = dependency_proibida
    response = client.get("/public/classrooms", params={"unit": unit})

    assert response.status_code == 200
    assert "set-cookie" not in response.headers
    payload = public_sigaa.payloads[0]
    assert payload["formTurma:inputDepto"] == "673"
    assert payload["formTurma:inputAno"] == "2031"
    assert payload["formTurma:inputPeriodo"] == "4"
    assert payload["formTurma:inputNivel"] == ""
    assert response.json() == [
        {
            "number": "01",
            "semester": "2031.4",
            "schedule": "24T23",
            "schedule_description": None,
            "room": "S3",
            "vacancies": 50,
            "occupied": 30,
            "teachers": [{"name": "DOCENTE", "hours": 60}],
            "subject": {
                "code": "FGA0030",
                "sigaa_id": None,
                "name": "ESTRUTURAS DE DADOS 2",
                "hours": 60,
                "unity": "FCTE",
            },
        }
    ]


@pytest.mark.parametrize("semester", ["2026.2", "2027.1", "2026.4"])
def test_semestre_explicito_sobrescreve_ano_e_periodo(client, public_sigaa, semester):
    response = client.get(
        "/public/classrooms", params={"unit": "gama", "semester": semester}
    )

    assert response.status_code == 200
    year, period = semester.split(".")
    payload = public_sigaa.payloads[0]
    assert payload["formTurma:inputAno"] == year
    assert payload["formTurma:inputPeriodo"] == period
    assert payload["formTurma:inputNivel"] == ""


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"unit": ""},
        {"unit": "   "},
        {"unit": "gama", "number": ""},
        {"unit": "gama", "number": "   "},
        {"number": "01"},
        *(
            {"unit": "gama", "semester": value}
            for value in ("", "all", "2026", "2026.12", "26.2", "2026-2", "abcd.2")
        ),
    ],
)
def test_filtros_invalidos_nao_consultam_sigaa(client, public_sigaa, params):
    assert client.get("/public/classrooms", params=params).status_code == 422
    assert public_sigaa.paths == []


@pytest.mark.parametrize(
    "unit,message",
    [("campus", "casa com 2 unidades"), ("inexistente", "Nenhuma unidade")],
)
def test_unidade_ambigua_ou_inexistente_informa_erro(
    client, public_sigaa, unit, message
):
    response = client.get("/public/classrooms", params={"unit": unit})

    assert response.status_code == 422
    assert message in response.json()["detail"]
    assert public_sigaa.payloads == []


def test_filtro_recusado_pelo_sigaa_retorna_422(client, public_sigaa):
    public_sigaa.result = '<ul class="erros"><li>Unidade inválida.</li></ul>'
    response = client.get("/public/classrooms?unit=999999")
    assert response.status_code == 422
    assert response.json()["detail"] == "Unidade inválida."


def test_busca_sem_resultados_retorna_lista_vazia(client, public_sigaa):
    public_sigaa.result = (
        '<ul class="erros"><li>Não foram encontrados resultados.</li></ul>'
    )
    response = client.get("/public/classrooms?unit=gama")
    assert response.status_code == 200
    assert response.json() == []
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "contains,expected", [(None, [672, 673]), ("ceilandia", [672])]
)
def test_unidades_vem_do_formulario_sem_login(client, public_sigaa, contains, expected):
    params = {"contains": contains} if contains is not None else {}
    response = client.get("/public/classrooms/units", params=params)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert [unit["id"] for unit in response.json()] == expected
    assert public_sigaa.payloads == []


@pytest.mark.parametrize(
    "path", ["/public/classrooms?unit=gama", "/public/classrooms/units"]
)
@pytest.mark.parametrize("error", ["http", "html"])
def test_falha_do_sigaa_publico_retorna_502(client, public_sigaa, path, error):
    if error == "http":
        public_sigaa.status = 503
    else:
        public_sigaa.form = "<html>layout mudou</html>"
    assert client.get(path).status_code == 502


def test_classrooms_continua_privado(client, public_sigaa):
    assert client.get("/classrooms", params={"unit": "gama"}).status_code == 401
    assert public_sigaa.paths == []


def test_openapi_publico_documenta_filtros(client):
    paths = client.get("/openapi.json").json()["paths"]
    route = paths["/public/classrooms"]["get"]
    params = {p["name"]: p for p in route["parameters"]}
    assert set(params) == {"unit", "semester", "contains", "local", "code", "number"}
    assert params["unit"]["required"] is False
    assert params["code"]["required"] is False
    assert params["semester"]["required"] is False
    assert params["contains"]["required"] is False
    assert params["local"]["required"] is False
    assert params["number"]["required"] is False
    number_schema = params["number"]["schema"]["anyOf"][0]
    assert number_schema["type"] == "integer"
    assert number_schema["minimum"] == 1
    assert number_schema["maximum"] == 99
    assert {"404", "422", "502"} <= route["responses"].keys()
    assert "401" not in route["responses"]
    assert "/public/classrooms/units" in paths


@pytest.mark.parametrize(
    "contains,expected",
    [
        (None, ["01", "02", "03"]),
        ("", ["01", "02", "03"]),
        ("   ", ["01", "02", "03"]),
        ("matematica", ["01", "03"]),
        ("MATEMÁTICA", ["01", "03"]),
        ("  matemática   aplicada  ", ["01"]),
        ("edson", ["01"]),
        ("  JOAO   DA SILVA ", ["02"]),
        ("mat001", ["01"]),
        ("inexistente", []),
        ("FCTE", []),
    ],
)
def test_contains_filtra_disciplina_codigo_ou_docente(
    client, public_sigaa, contains, expected
):
    public_sigaa.result = """
    <table class="listagem">
      <tr class="agrupador"><td colspan="8">
        <span class="tituloDisciplina">MAT001 - MATEMÁTICA APLICADA</span>
      </td></tr>
      <tr class="linhaPar">
        <td>01</td><td>2026.4</td><td>ANA MATEMÁTICA (30h)<br/>EDSON (30h)</td>
        <td>24T23</td><td></td><td>50</td><td>30</td><td>FCTE - S3</td>
      </tr>
      <tr class="agrupador"><td colspan="8">
        <span class="tituloDisciplina">CIC001 - COMPUTAÇÃO</span>
      </td></tr>
      <tr class="linhaPar">
        <td>02</td><td>2026.4</td><td>JOÃO DA SILVA (60h)</td>
        <td>24T23</td><td></td><td>50</td><td>30</td><td>FCTE - S3</td>
      </tr>
      <tr class="agrupador"><td colspan="8">
        <span class="tituloDisciplina">MAT002 - MATEMÁTICA DISCRETA</span>
      </td></tr>
      <tr class="linhaPar">
        <td>03</td><td>2026.4</td><td></td>
        <td>24T23</td><td></td><td>50</td><td>30</td><td>FCTE - S3</td>
      </tr>
    </table>
    """
    params = {"unit": "gama", "semester": "2026.4"}
    if contains is not None:
        params["contains"] = contains
    response = client.get("/public/classrooms", params=params)

    assert response.status_code == 200
    assert [classroom["number"] for classroom in response.json()] == expected
    assert len(public_sigaa.payloads) == 1
    payload = public_sigaa.payloads[0]
    assert "contains" not in payload
    assert payload["formTurma:inputDepto"] == "673"
    assert payload["formTurma:inputAno"] == "2026"
    assert payload["formTurma:inputPeriodo"] == "4"


@pytest.mark.parametrize(
    "local,contains,expected",
    [
        (None, None, ["01", "02", "03", "04"]),
        ("", None, ["01", "02", "03", "04"]),
        ("   ", None, ["01", "02", "03", "04"]),
        ("s3", None, ["01", "03"]),
        ("  fcte   -   S3  ", None, ["01", "03"]),
        ("auditorio", None, ["02"]),
        ("AUDITÓRIO", None, ["02"]),
        ("fcte", None, ["01", "03"]),
        ("inexistente", None, []),
        ("FGA0030", None, []),
        ("S3", "FGA0030", ["01"]),
        ("auditorio", "matematica", []),
        ("", "matematica", ["03", "04"]),
    ],
)
def test_local_filtra_local_completo_e_combina_com_contains(
    client, public_sigaa, local, contains, expected
):
    public_sigaa.result = """
    <table class="listagem">
      <tr class="agrupador"><td colspan="8">
        <span class="tituloDisciplina">FGA0030 - ESTRUTURAS DE DADOS 2</span>
      </td></tr>
      <tr class="linhaPar">
        <td>01</td><td>2026.2</td><td>DOCENTE (60h)</td>
        <td>24T23</td><td></td><td>50</td><td>30</td><td>FCTE - S3</td>
      </tr>
      <tr class="linhaPar">
        <td>02</td><td>2026.2</td><td>DOCENTE (60h)</td>
        <td>24T23</td><td></td><td>50</td><td>30</td><td>AUDITÓRIO</td>
      </tr>
      <tr class="agrupador"><td colspan="8">
        <span class="tituloDisciplina">MAT001 - MATEMÁTICA</span>
      </td></tr>
      <tr class="linhaPar">
        <td>03</td><td>2026.2</td><td>DOCENTE (60h)</td>
        <td>24T23</td><td></td><td>50</td><td>30</td><td>FCTE - S3</td>
      </tr>
      <tr class="linhaPar">
        <td>04</td><td>2026.2</td><td>DOCENTE (60h)</td>
        <td>24T23</td><td></td><td>50</td><td>30</td><td></td>
      </tr>
    </table>
    """
    params = {"unit": "gama", "semester": "2026.2"}
    if local is not None:
        params["local"] = local
    if contains is not None:
        params["contains"] = contains
    response = client.get("/public/classrooms", params=params)

    assert response.status_code == 200
    assert [classroom["number"] for classroom in response.json()] == expected
    assert len(public_sigaa.payloads) == 1
    payload = public_sigaa.payloads[0]
    assert "local" not in payload
    assert "contains" not in payload
    assert payload["formTurma:inputDepto"] == "673"
    assert payload["formTurma:inputAno"] == "2026"
    assert payload["formTurma:inputPeriodo"] == "2"


@pytest.fixture
def code_index(monkeypatch):
    index = {
        "prefixes": {"FGA": [673], "FCTE": [673], "MAT": [518]},
        "units": {
            "673": "CAMPUS UNB GAMA",
            "672": "CAMPUS UNB CEILÂNDIA",
            "518": "DEPTO MATEMÁTICA",
        },
    }
    monkeypatch.setattr(public_classroom, "_code_index", lambda: index)
    return index["prefixes"]


@pytest.mark.parametrize("code", ["FGA0030", "fga0030", "  FgA0030  "])
def test_code_descobre_unidade_preserva_defaults_e_codigo_completo(
    client, public_sigaa, code_index, code
):
    public_sigaa.result = RESULTS.strip().removesuffix("</table>") + RESULTS.replace(
        "FGA0030", "FGA00301"
    ).strip().removeprefix('<table class="listagem">')
    response = client.get("/public/classrooms", params={"code": code})
    assert response.status_code == 200
    assert [row["subject"]["code"] for row in response.json()] == ["FGA0030"]
    assert "set-cookie" not in response.headers
    assert len(public_sigaa.payloads) == 1
    payload = public_sigaa.payloads[0]
    assert payload["formTurma:inputDepto"] == "673"
    assert payload["formTurma:inputAno"] == "2031"
    assert payload["formTurma:inputPeriodo"] == "4"
    assert "code" not in payload


@pytest.mark.parametrize("code,unit", [("MAT0031", "518"), ("FCTE0030", "673")])
def test_code_aceita_varios_prefixos_na_mesma_unidade(
    client, public_sigaa, code_index, code, unit
):
    public_sigaa.result = RESULTS.replace("FGA0030", code)
    response = client.get("/public/classrooms", params={"code": code})
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert public_sigaa.payloads[0]["formTurma:inputDepto"] == unit


def test_code_consulta_todas_unidades_do_prefixo_sem_duplicar_turmas(
    client, public_sigaa, code_index
):
    code_index["FGA"] = [673, 672]
    public_sigaa.results_by_unit["672"] = RESULTS.replace(
        "</table>",
        '<tr class="linhaPar"><td>02</td><td>2031.4</td><td>DOCENTE (60h)</td>'
        "<td>24T23</td><td></td><td>50</td><td>30</td><td>FCTE - S3</td></tr></table>",
    )
    response = client.get("/public/classrooms?code=FGA0030")
    assert response.status_code == 200
    assert [row["number"] for row in response.json()] == ["01", "02"]
    assert [p["formTurma:inputDepto"] for p in public_sigaa.payloads] == ["673", "672"]


def test_code_nao_oculta_falha_em_uma_das_unidades(client, public_sigaa, code_index):
    code_index["FGA"] = [673, 672]
    public_sigaa.results_by_unit["672"] = "<html>layout mudou</html>"
    assert client.get("/public/classrooms?code=FGA0030").status_code == 502


@pytest.mark.parametrize(
    "code", ["", " ", "FGA", "0030", "FGA-0030", "FGA 0030", "FGA0030X", "FGA００３０"]
)
def test_code_invalido_nao_consulta_sigaa(client, public_sigaa, code):
    assert client.get("/public/classrooms", params={"code": code}).status_code == 422
    assert public_sigaa.paths == []


def test_prefixo_desconhecido_pede_unidade_sem_varrer_sigaa(
    client, public_sigaa, code_index
):
    response = client.get("/public/classrooms?code=NOVO0001")
    assert response.status_code == 422
    assert response.json()["detail"] == (
        "Prefixo `NOVO` não encontrado no índice. "
        "Ele pode não existir no SIGAA ou ainda não ter sido mapeado. "
        "Informe `unit` junto de `code` para buscar diretamente nessa unidade."
    )
    assert public_sigaa.paths == []


def test_unit_explicita_dispensa_indice_e_restringe_busca(
    client, public_sigaa, monkeypatch
):
    def index_proibido():
        pytest.fail("Unidade explícita não deve depender do índice")

    monkeypatch.setattr(public_classroom, "_code_index", index_proibido)
    public_sigaa.result = RESULTS.replace("FGA0030", "NOVO0001")
    response = client.get("/public/classrooms?unit=gama&code=NOVO0001")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert [p["formTurma:inputDepto"] for p in public_sigaa.payloads] == ["673"]


@pytest.mark.parametrize(
    "contains,local,expected",
    [("dados", "s3", 1), ("inexistente", "s3", 0), ("dados", "auditorio", 0)],
)
def test_code_combina_semestre_contains_e_local(
    client, public_sigaa, code_index, contains, local, expected
):
    response = client.get(
        "/public/classrooms",
        params={
            "code": "FGA0030",
            "semester": "2026.4",
            "contains": contains,
            "local": local,
        },
    )
    assert response.status_code == 200
    assert len(response.json()) == expected
    assert public_sigaa.payloads[0]["formTurma:inputAno"] == "2026"
    assert public_sigaa.payloads[0]["formTurma:inputPeriodo"] == "4"


@pytest.mark.parametrize("semester", [None, "2026.2"])
@pytest.mark.parametrize("code", ["FGA0029", "FGA0031", "FGA30", "FGA9999"])
def test_codigo_ausente_nao_e_inferido_por_intervalo_ou_prefixo(
    client, public_sigaa, code_index, semester, code
):
    public_sigaa.result = RESULTS.strip().removesuffix("</table>") + RESULTS.replace(
        "FGA0030", "FGA0132"
    ).strip().removeprefix('<table class="listagem">')
    params = {"code": code}
    if semester is not None:
        params["semester"] = semester
    response = client.get("/public/classrooms", params=params)
    term = (
        f"no semestre `{semester}`"
        if semester is not None
        else "no semestre padrão do SIGAA"
    )
    assert response.status_code == 404
    assert response.json()["detail"] == (
        f"Nenhuma turma encontrada para o código `{code}` "
        "nas unidades mapeadas para o prefixo `FGA`: "
        f"`CAMPUS UNB GAMA` (ID 673) {term}. "
        "A disciplina pode não existir ou não ter oferta nessas condições. "
        "Confira `code`, `unit` e `semester`."
    )
    assert response.headers["cache-control"] == "no-store"


def test_codigo_sem_oferta_na_unidade_explicita_informa_escopo(
    client, public_sigaa, code_index
):
    response = client.get("/public/classrooms?unit=gama&code=NOVO0001&semester=2026.4")
    assert response.status_code == 404
    assert response.json()["detail"] == (
        "Nenhuma turma encontrada para o código `NOVO0001` na unidade `gama` "
        "no semestre `2026.4`. A disciplina pode não existir ou não ter oferta "
        "nessas condições. Confira `code`, `unit` e `semester`."
    )


@pytest.mark.parametrize("found_in_second_unit", [False, True])
def test_codigo_sem_oferta_na_primeira_unidade_consulta_as_demais(
    client, public_sigaa, code_index, found_in_second_unit
):
    code_index["FGA"] = [673, 672]
    public_sigaa.result = (
        '<ul class="erros"><li>Não foram encontrados resultados.</li></ul>'
    )
    if found_in_second_unit:
        public_sigaa.results_by_unit["672"] = RESULTS
    response = client.get("/public/classrooms?code=FGA0030")
    assert response.status_code == (200 if found_in_second_unit else 404)
    assert [p["formTurma:inputDepto"] for p in public_sigaa.payloads] == ["673", "672"]
    if not found_in_second_unit:
        detail = response.json()["detail"]
        assert "`CAMPUS UNB GAMA` (ID 673); `CAMPUS UNB CEILÂNDIA` (ID 672)" in detail
        assert "DEPTO MATEMÁTICA" not in detail


def test_codigo_sem_oferta_nao_oculta_falha_do_sigaa(client, public_sigaa, code_index):
    code_index["FGA"] = [673, 672]
    public_sigaa.results_by_unit["672"] = "<html>layout mudou</html>"
    assert client.get("/public/classrooms?code=FGA9999").status_code == 502


def test_contains_com_codigo_ausente_continua_lista_vazia(client, public_sigaa):
    response = client.get("/public/classrooms?unit=gama&contains=FGA9999")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.parametrize("selector", [{"unit": "gama"}, {"code": "FGA0030"}])
@pytest.mark.parametrize(
    "number,expected",
    [
        (None, ["01", "02", "10", "99"]),
        ("01", ["01"]),
        (" 01 ", ["01"]),
        ("1", ["01"]),
        ("02", ["02"]),
        ("2", ["02"]),
        ("10", ["10"]),
        ("99", ["99"]),
        ("98", []),
    ],
)
def test_number_com_e_sem_zero_seleciona_a_mesma_turma(
    client, public_sigaa, code_index, selector, number, expected
):
    public_sigaa.result = (
        '<table class="listagem">'
        + "".join(
            RESULTS.replace("<td>01</td>", f"<td>{value}</td>")
            .strip()
            .removeprefix('<table class="listagem">')
            .removesuffix("</table>")
            for value in ("01", "02", "10", "99")
        )
        + "</table>"
    )
    params = dict(selector)
    if number is not None:
        params["number"] = number
    response = client.get("/public/classrooms", params=params)

    assert response.status_code == 200
    assert [row["number"] for row in response.json()] == expected
    assert response.headers["cache-control"] == "no-store"
    assert len(public_sigaa.payloads) == 1
    assert "number" not in public_sigaa.payloads[0]


@pytest.mark.parametrize("number", ["A", "1A", "0", "00", "100", "-1", "1.5"])
def test_number_invalido_nao_consulta_sigaa(client, public_sigaa, number):
    response = client.get(
        "/public/classrooms", params={"unit": "gama", "number": number}
    )
    assert response.status_code == 422
    assert public_sigaa.paths == []


@pytest.mark.parametrize("number", ["1", "01"])
def test_number_aceita_turma_sem_zero_no_sigaa(client, public_sigaa, number):
    public_sigaa.result = RESULTS.replace("<td>01</td>", "<td>1</td>")
    response = client.get(
        "/public/classrooms", params={"unit": "gama", "number": number}
    )
    assert response.status_code == 200
    assert [row["number"] for row in response.json()] == ["1"]


@pytest.mark.parametrize(
    "number,contains,local,expected",
    [
        ("01", "dados", "s3", ["01"]),
        ("1", "dados", "s3", ["01"]),
        ("02", "dados", "s3", []),
        ("01", "inexistente", "s3", []),
        ("01", "dados", "auditorio", []),
    ],
)
def test_number_combina_com_codigo_semestre_contains_e_local(
    client, public_sigaa, code_index, number, contains, local, expected
):
    response = client.get(
        "/public/classrooms",
        params={
            "unit": "gama",
            "code": "FGA0030",
            "semester": "2026.2",
            "number": number,
            "contains": contains,
            "local": local,
        },
    )
    assert response.status_code == 200
    assert [row["number"] for row in response.json()] == expected
    assert public_sigaa.payloads[0]["formTurma:inputAno"] == "2026"
    assert public_sigaa.payloads[0]["formTurma:inputPeriodo"] == "2"


def test_number_nao_oculta_codigo_sem_oferta(client, public_sigaa, code_index):
    response = client.get("/public/classrooms?code=FGA9999&number=01")
    assert response.status_code == 404
    assert "FGA9999" in response.json()["detail"]


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/update_classroom_code_units.py"


@pytest.fixture
def updater(monkeypatch):
    collect = runpy.run_path(str(SCRIPT))["collect_index"]
    client = MagicMock()
    client.__aenter__.return_value = client
    client.classrooms.list_units = AsyncMock(
        return_value=[
            Unit(id=1, name="Unidade A"),
            Unit(id=2, name="Unidade B"),
            Unit(id=3, name="Sem oferta"),
        ]
    )
    monkeypatch.setitem(
        collect.__globals__, "SigaaPublicClient", lambda **kwargs: client
    )
    monkeypatch.setitem(
        collect.__globals__,
        "asyncio",
        SimpleNamespace(Queue=asyncio.Queue, gather=asyncio.gather, sleep=AsyncMock()),
    )
    return collect, client


async def test_indice_coleta_todos_prefixos_por_unidade_e_preserva_multiplas_unidades(
    updater,
):
    collect, client = updater
    codes = {1: ["FGA0132", "FCTE0030", "FGA0001"], 2: ["FGA0132"], 3: []}

    async def search(unit, *, year, period):
        assert (year, period) == (2026, 2)
        return [
            PublicClassroom(
                number="01",
                semester="2026.2",
                subject=Subject(name="Disciplina", code=code),
            )
            for code in codes[unit]
        ]

    client.classrooms.search = AsyncMock(side_effect=search)
    index = await collect("2026.2")
    assert index["prefixes"] == {"FCTE": [1], "FGA": [1, 2]}
    assert set(index["units"]) == {"1", "2", "3"}
    assert index["units_without_classes"] == [3]
    assert index["semesters"] == ["2026.2"]
    assert client.classrooms.search.await_count == 3


async def test_indice_nao_aceita_coleta_parcial(updater):
    collect, client = updater
    client.classrooms.search = AsyncMock(side_effect=SigaaParseError("layout mudou"))
    with pytest.raises(RuntimeError, match="índice anterior preservado"):
        await collect()
    assert client.classrooms.search.await_count == 9


@pytest.mark.parametrize("code", [None, "", "FGA-0132", "FGA", "FGA００３０"])
async def test_indice_avisa_sobre_codigo_invalido_e_continua_coleta(
    updater, caplog, code
):
    collect, client = updater
    client.classrooms.list_units.return_value = [Unit(id=1, name="Unidade A")]
    client.classrooms.search = AsyncMock(
        return_value=[
            PublicClassroom(
                number="01",
                semester="2026.2",
                subject=Subject(name="Válida", code="  fga0132  "),
            ),
            PublicClassroom(
                number="02",
                semester="2026.2",
                subject=Subject(name="Inválida", code=code),
            ),
        ]
    )

    with caplog.at_level(logging.WARNING):
        index = await collect()

    assert index["prefixes"] == {"FGA": [1]}
    assert len(caplog.records) == 1
    record = caplog.records[0]
    assert record.levelno == logging.WARNING
    message = record.getMessage()
    assert "Turma ignorada" in message
    assert "unidade=1 (Unidade A)" in message
    assert "turma=02" in message
    assert "semestre=2026.2" in message
    assert "disciplina='Inválida'" in message
    assert f"código={code!r} fora do padrão" in message


async def test_indice_repete_falha_transitoria_e_mantem_semestre_do_formulario(updater):
    collect, client = updater
    client.classrooms.list_units.return_value = [Unit(id=1, name="Unidade A")]
    client.classrooms.search = AsyncMock(
        side_effect=[
            SigaaParseError("temporário"),
            [
                PublicClassroom(
                    number="01",
                    semester="2026.2",
                    subject=Subject(name="Disciplina", code="FGA0132"),
                )
            ],
        ]
    )
    index = await collect()
    assert index["prefixes"] == {"FGA": [1]}
    assert client.classrooms.search.await_count == 2
    client.classrooms.search.assert_awaited_with(1, year=None, period=None)


def test_indice_distribuido_tem_origem_e_unidades_validas():
    path = SCRIPT.parents[1] / "api/modules/public_classrooms/classroom_code_units.json"
    index = json.loads(path.read_text(encoding="utf-8"))
    assert index["source"] == "https://sigaa.unb.br/sigaa/public/turmas/listar.jsf"
    assert index["generated_at"]
    assert index["semesters"]
    assert index["prefixes"]["FGA"] == [673]
    assert index["prefixes"]["FCTE"] == [673]
    assert index["prefixes"]["MAT"] == [518]
    assert _code_index() == index
    for prefix, units in index["prefixes"].items():
        assert prefix.isascii() and prefix.isalpha() and prefix.isupper()
        assert units == sorted(set(units))
        assert all(str(unit) in index["units"] for unit in units)
        assert not set(units) & set(index["units_without_classes"])
