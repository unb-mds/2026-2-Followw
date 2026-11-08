import httpx
import pytest
from bs4 import BeautifulSoup

from sigaa_client import (
    ClassroomGrade,
    Grade,
    SessionExpired,
    SigaaClient,
)
from sigaa_client.config import DASHBOARD_PATH
from sigaa_client.exceptions import SigaaParseError
from sigaa_client.private.classrooms import (
    Classrooms,
    _parse_grades,
)

from ...fakes import CREDENTIALS, FakeSession, FakeSigaa

GRADES = """
<html><body><div id="relatorio">
<h3>Relatório de Notas do(a) Aluno(a)</h3>
<table class="tabelaRelatorio">
<caption>2026.2</caption>
<thead><tr>
  <th>Código</th><th>Disciplina</th><th>Nota 1</th>
  <th>Resultado</th><th>Faltas</th><th>Situação</th>
</tr></thead>
<tbody>
  <tr class="linhaPar linha">
    <td>FGA0146</td><td>ESTRUTURAS DE DADOS 1</td>
    <td>MM</td><td>MS</td><td>0</td><td>APROVADO(A)</td>
  </tr>
  <tr class="linhaImpar linha">
    <td>FGA0158</td><td>ORIENTAÇÃO A OBJETOS</td>
    <td>--</td><td>0</td><td>--</td>
  </tr>
</tbody>
</table>
<table class="tabelaRelatorio">
<caption>2025.2</caption>
<thead><tr>
  <th>Código</th><th>Disciplina</th><th>Nota 1</th>
  <th>Resultado</th><th>Faltas</th><th>Situação</th>
</tr></thead>
<tbody><tr class="linhaPar linha">
  <td>FGA0146</td><td>ESTRUTURAS DE DADOS 1</td>
  <td>MI</td><td>MI</td><td>0</td><td>REPROVADO(A)</td>
</tr></tbody></table>
</div></body></html>
"""

GRADES_MENU = """
<form id="menu:form_menu_discente" name="menu:form_menu_discente"
      action="/sigaa/portais/discente/discente.jsf">
  <input type="hidden" name="menu:form_menu_discente" value="menu:form_menu_discente"/>
  <input type="hidden" name="id" value="123456"/>
  <input type="hidden" name="jscook_action" value=""/>
  <input type="hidden" name="javax.faces.ViewState" value="j_id2"/>
</form>
"""


@pytest.mark.parametrize(
    "page", ["<html></html>", GRADES_MENU.replace("javax.faces.ViewState", "ausente")]
)
async def test_notas_acusam_menu_ou_viewstate_ausente_antes_do_postback(page):
    session = FakeSession(page, GRADES)

    with pytest.raises(SigaaParseError):
        await Classrooms(session).list_grades()  # type: ignore[arg-type]

    assert session.payload == {}


def test_notas_trazem_todos_os_semestres_e_mencoes_do_resultado():
    assert _parse_grades(BeautifulSoup(GRADES, "lxml")) == [
        ClassroomGrade(subject_code="FGA0146", semester="2026.2", grade=Grade.MS),
        ClassroomGrade(subject_code="FGA0158", semester="2026.2"),
        ClassroomGrade(subject_code="FGA0146", semester="2025.2", grade=Grade.MI),
    ]


def test_mencao_diz_se_o_aluno_foi_aprovado():
    assert {grade for grade in Grade if grade.approved} == {
        Grade.SS,
        Grade.MS,
        Grade.MM,
    }


def test_unidade_com_varias_avaliacoes_nao_desloca_o_resultado():
    pagina = GRADES.replace("<th>Nota 1", '<th colspan="2">Nota 1').replace(
        "<td>MM</td>", "<td>8.0</td><td>MM</td>"
    )

    assert _parse_grades(BeautifulSoup(pagina, "lxml"))[0].grade == Grade.MS


@pytest.mark.parametrize("resultado", ["", "-", "--"])
def test_notas_sem_resultado_vem_none(resultado):
    pagina = GRADES.replace("<td>MS</td>", f"<td>{resultado}</td>")
    assert _parse_grades(BeautifulSoup(pagina, "lxml"))[0].grade is None


def test_relatorio_sem_disciplinas_retorna_lista_vazia():
    assert (
        _parse_grades(
            BeautifulSoup("<h3>Relatório de Notas do(a) Aluno(a)</h3>", "lxml")
        )
        == []
    )


@pytest.mark.parametrize(
    "pagina",
    [
        GRADES.replace("MS", "XX"),
        GRADES.replace("Resultado", "Média"),
        GRADES.replace("Código", "ID"),
        GRADES.replace("2026.2", "2026-2"),
        GRADES.replace("<td>MM</td><td>MS</td><td>0</td>", ""),
        GRADES.replace("FGA0158", "FGA0146"),
        GRADES.replace("<td>FGA0158</td>", "<td></td>"),
        "<html><body><div id='painel-erros'>Outro aviso</div></body></html>",
    ],
)
def test_notas_fora_do_formato_sao_barulhentas(pagina):
    with pytest.raises(SigaaParseError):
        _parse_grades(BeautifulSoup(pagina, "lxml"))


class GradesSigaa:
    """Simula o CAS e expira a sessão entre o portal e o postback de notas."""

    def __init__(self, *, expire: bool = False, always_expire: bool = False) -> None:
        self.auth = FakeSigaa()
        self.auth.valid_tokens.add("vivo")
        self.expire = expire
        self.always_expire = always_expire
        self.gets = 0
        self.payloads: list[dict[str, str]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.path != DASHBOARD_PATH:
            return self.auth(request)
        if request.method == "GET":
            self.gets += 1
            return httpx.Response(
                200, text=GRADES_MENU.replace("j_id2", f"j_id{self.gets}")
            )
        self.payloads.append(dict(httpx.QueryParams(request.content.decode())))
        if self.expire:
            self.expire = self.always_expire
            self.auth.valid_tokens.clear()
            return httpx.Response(302, headers={"location": "/sigaa/verTelaLogin.do"})
        return httpx.Response(200, text=GRADES)


@pytest.mark.parametrize("expire", [False, True])
async def test_notas_abrem_pelo_menu_e_refazem_postback_depois_de_relogin(expire):
    sigaa = GradesSigaa(expire=expire)
    async with SigaaClient(
        CREDENTIALS, session_token="vivo", transport=httpx.MockTransport(sigaa)
    ) as client:
        grades = await client.classrooms.list_grades()

    assert len(grades) == 3
    assert len(sigaa.payloads) == 1 + expire
    assert sigaa.auth.logins == int(expire)
    for payload in sigaa.payloads:
        assert payload["menu:form_menu_discente"] == "menu:form_menu_discente"
        assert payload["id"] == "123456"
        assert payload["jscook_action"] == (
            "menu_form_menu_discente_discente_menu:A]#{ relatorioNotasAluno.gerarRelatorio }"
        )
    assert len({p["javax.faces.ViewState"] for p in sigaa.payloads}) == len(
        sigaa.payloads
    )


async def test_notas_nao_tentam_relogin_indefinidamente():
    sigaa = GradesSigaa(expire=True, always_expire=True)
    async with SigaaClient(
        CREDENTIALS, session_token="vivo", transport=httpx.MockTransport(sigaa)
    ) as client:
        with pytest.raises(SessionExpired):
            await client.classrooms.list_grades()
    assert len(sigaa.payloads) == 2
    assert sigaa.auth.logins == 1
