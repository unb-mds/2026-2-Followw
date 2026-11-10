from datetime import date

import httpx
import pytest
from bs4 import BeautifulSoup

from sigaa_client import (
    AttendanceStatus,
    ClassroomProgress,
)
from sigaa_client.exceptions import SigaaParseError
from sigaa_client.private.classrooms import (
    _open_frequency,
    _parse_frequency,
)

FREQUENCY = """
<html><body>
<div id="barraDireita">
  <div class="rich-stglpanel-header">Andamento das Aulas </div>
  <div class="rich-stglpanel-body">
    <div>Aulas (Ministradas/Total): <i>24 / 72</i></div>
    <div class="progress"><div class="progress-bar" style="width: 33.3%;">33%</div></div>
    <div>% de Carga Horária Ministrada</div>
  </div>
</div>
<div id="conteudo"><fieldset><legend> Mapa de Frequências </legend>
<table class="listing">
  <thead><tr><th>Data</th><th>Situação</th></tr></thead>
  <tbody>
    <tr><td class="first">11/08/2026</td><td> Presente </td></tr>
    <tr><td class="first">20/08/2026</td><td> 2 Falta(s) </td></tr>
    <tr><td class="first">25/08/2026</td><td> Não Registrada </td></tr>
  </tbody>
</table>
<div class="botoes-show">
  <b>Presenças Registradas:</b> 63<br/>
  <span><b>Número de Aulas com Registro de Frequência:</b> 65</span><br/>
  <b>Porcentagem de Frequência em relação as Aulas com Registro de Frequência:</b> 96%
  <br/>
  <b>Número de Aulas definidas pela CH do Componente:</b> 72<br/>
  <b>Porcentagem de Frequência em relação a CH:</b> 87%
</div>
</fieldset></div>
</body></html>
"""

NOT_LAUNCHED = """
<html><body>
<div class="rich-stglpanel-header">Andamento das Aulas </div>
<div class="rich-stglpanel-body">
  <div>Aulas (Ministradas/Total): <i>10 / 32</i></div>
  <div class="progress"><div class="progress-bar" style="width: 31.2%;">31%</div></div>
</div>
<div id="conteudo"><fieldset><legend> Mapa de Frequências </legend>
<span style="color:#C00;">A frequência ainda não foi lançada.</span>
<div class="botoes-show">
  <b>Presenças Registradas:</b> 32<br/>
  <span><b>Número de Aulas com Registro de Frequência:</b> 32</span><br/>
  <b>Porcentagem de Frequência em relação as Aulas com Registro de Frequência:</b> 100%
  <br/>
  <b>Número de Aulas definidas pela CH do Componente:</b> 32<br/>
  <b>Porcentagem de Frequência em relação a CH:</b> 100%
</div>
</fieldset></div>
</body></html>
"""

CLASSROOM_HOME = """
<html><body>
<form id="formMenu" name="formMenu" action="/sigaa/ava/index.jsf">
  <a href="#" onclick="jsfcljs(document.getElementById('formMenu'),
    {'formMenu:j_id_jsp_97':'formMenu:j_id_jsp_97'},'');">Frequência</a>
  <a href="#" onclick="jsfcljs(document.getElementById('formMenu'),
    {'formMenu:j_id_jsp_142':'formMenu:j_id_jsp_142'},'');">Situação dos Discentes</a>
  <a href="#" onclick="jsfcljs(document.getElementById('formMenu'),
    {'formMenu:j_id_jsp_88':'formMenu:j_id_jsp_88'},'');">
    <div class="itemMenu">Notícias</div></a>
  <input name="javax.faces.ViewState" type="hidden" value="j_id6"/>
</form>
</body></html>
"""


class FakeSession:
    """Só o suficiente para o ritual do menu: uma página no GET, outra no POST."""

    def __init__(self, page: str, result: str) -> None:
        self.page = page
        self.result = result
        self.payload: dict[str, str] = {}

    async def get(self, url: str, **_: object) -> httpx.Response:
        return httpx.Response(200, text=self.page)

    async def post(self, url: str, data: dict[str, str], **_: object) -> httpx.Response:
        self.payload = data
        return httpx.Response(200, text=self.result)


def test_frequencia_traz_aulas_totais_e_andamento():
    frequencia = _parse_frequency(BeautifulSoup(FREQUENCY, "lxml"))

    assert frequencia.progress == ClassroomProgress(taught=24, total=72, percentage=33)
    assert frequencia.frequency is not None
    aulas = frequencia.frequency.entries
    assert [aula.status for aula in aulas] == [
        AttendanceStatus.PRESENTE,
        AttendanceStatus.FALTA,
        AttendanceStatus.NAO_REGISTRADA,
    ]
    assert aulas[1].occurred_on == date(2026, 8, 20)
    assert (aulas[1].absences, aulas[0].absences) == (2, 0)
    assert (frequencia.frequency.attended, frequencia.frequency.registered) == (63, 65)
    assert frequencia.frequency.registered_percentage == 96
    assert (frequencia.frequency.total, frequencia.frequency.total_percentage) == (
        72,
        87,
    )


def test_frequencia_nao_lancada_vem_none_com_andamento():
    frequencia = _parse_frequency(BeautifulSoup(NOT_LAUNCHED, "lxml"))

    # Os totais dessa tela são fictícios (100% em tudo) e não podem vazar.
    assert frequencia.frequency is None
    assert frequencia.progress == ClassroomProgress(taught=10, total=32, percentage=31)


def test_resumo_separa_pendencias_dos_totais_do_sigaa():
    frequency = _parse_frequency(BeautifulSoup(FREQUENCY, "lxml"))
    assert frequency.frequency_status == "parcialmente_registrada"
    assert frequency.frequency.summary.model_dump() == {
        "total_entries": 3,
        "recorded_entries": 2,
        "unrecorded_entries": 1,
        "absence_entries": 1,
        "total_absences": 2,
    }
    assert frequency.frequency.registered == 65
    assert frequency.frequency.total_percentage == 87


@pytest.mark.parametrize(
    "html,expected",
    [
        (NOT_LAUNCHED, "nao_registrada"),
        (
            FREQUENCY.replace("Presente", "Não Registrada").replace(
                "2 Falta(s)", "Não Registrada"
            ),
            "nao_registrada",
        ),
        (FREQUENCY.replace("Não Registrada", "Presente"), "registrada"),
    ],
)
def test_estado_dos_lancamentos_nao_depende_da_porcentagem(html, expected):
    frequency = _parse_frequency(BeautifulSoup(html, "lxml"))
    assert frequency.frequency_status == expected
    assert frequency.model_dump(mode="json")["frequency_status"] == expected
    if html == NOT_LAUNCHED:
        assert frequency.frequency is None


def test_situacao_desconhecida_e_barulhenta():
    pagina = FREQUENCY.replace("Presente", "Dispensado")

    with pytest.raises(SigaaParseError):
        _parse_frequency(BeautifulSoup(pagina, "lxml"))


def test_andamento_ausente_e_barulhento():
    pagina = FREQUENCY.replace("Andamento das Aulas", "Outro Bloco")

    with pytest.raises(SigaaParseError):
        _parse_frequency(BeautifulSoup(pagina, "lxml"))


async def test_frequencia_abre_pelo_postback_do_menu():
    session = FakeSession(CLASSROOM_HOME, FREQUENCY)

    pagina = await _open_frequency(session, True)  # type: ignore[arg-type]

    assert pagina == FREQUENCY
    assert session.payload == {
        "formMenu": "formMenu",
        "formMenu:j_id_jsp_97": "formMenu:j_id_jsp_97",
        "javax.faces.ViewState": "j_id6",
    }
