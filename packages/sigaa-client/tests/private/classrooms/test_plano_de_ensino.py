from datetime import date
from unittest.mock import AsyncMock

import pytest
from bs4 import BeautifulSoup

from sigaa_client import Classroom, SessionRenewed, SigaaParseError, Subject
from sigaa_client.private.classrooms import Classrooms
from sigaa_client.private.teaching_plan import _parse_teaching_plan

from ...fakes import NewsSession

PLAN = """
<table class="listagem"><caption>Metodologia de Ensino e Avaliação</caption>
<tbody>
<tr><th>Metodologia:</th><td><p>Aulas <strong>práticas</strong>.</p>
<ol><li>Grupos</li><li>Anéis</li></ol><a href="/material">Material</a></td></tr>
<tr><th>Procedimentos de Avaliação da Aprendizagem:</th>
<td><p>Média das <b>provas</b>.</p></td></tr>
<tr><th>Horário de atendimento:</th><td>A combinar.</td></tr>
</tbody></table>
<table><caption>Programa</caption><tr><td>
<a href="#" onclick="jsfcljs(f,{'idComponente':'1'},'')">Programa</a>
</td></tr></table>
<table id="listaTopicosAula"><caption>Cronograma de Aulas</caption>
<thead><tr><th>Início</th><th>Fim</th><th>Descrição</th></tr></thead><tbody>
<tr><td>03/11/2026</td><td>26/11/2026</td><td>Material A3</td></tr>
<tr><td>11/08/2026</td><td>17/09/2026</td><td>Material A1</td></tr>
</tbody></table>
<table id="listaAvaliacoes"><caption>Avaliações</caption>
<thead><tr><th>Data</th><th>Descrição</th></tr></thead><tbody>
<tr><td>29/10/2026</td><td>Avaliação A2</td></tr>
</tbody></table>
<table><caption>Referências Básicas</caption><tbody>
<tr><td>Outros</td><td>Introdução à Álgebra.</td></tr>
<tr><td>Outros</td><td>Introdução à Álgebra.</td></tr>
</tbody></table>
<table><caption>Referências Complementares</caption><tbody></tbody></table>
"""
MISSING = '<div id="painel-erros"><ul><li>Esta turma ainda não possui um plano cadastrado.</li></ul></div>'
HOME = """
<form id="formMenu" action="/sigaa/ava/index.jsf">
<a href="#" onclick="jsfcljs(f,{'formMenu:plano99':'formMenu:plano99'},'')">
Plano de Ensino</a>
<input name="javax.faces.ViewState" value="estado-atual"/>
</form>
"""
CONTEXT = """<script>var nomeTurma = "<div>Turma: FGA0108 - MATEMÁTICA DISCRETA 2 (2026.2 - T02)</div>";</script>"""


def parse(page=PLAN):
    return _parse_teaching_plan(BeautifulSoup(page, "lxml"))


def test_plano_preserva_markdown_datas_ordem_e_referencias_repetidas():
    plan = parse()
    assert "**práticas**" in plan.methodology
    assert "1. Grupos" in plan.methodology
    assert "[Material](https://sigaa.unb.br/material)" in plan.methodology
    assert plan.assessment_procedures == "Média das **provas**."
    assert plan.office_hours == "A combinar."
    assert [
        (item.start_date, item.end_date, item.description) for item in plan.schedule
    ] == [
        (date(2026, 11, 3), date(2026, 11, 26), "Material A3"),
        (date(2026, 8, 11), date(2026, 9, 17), "Material A1"),
    ]
    assert [(item.date, item.description) for item in plan.assessments] == [
        (date(2026, 10, 29), "Avaliação A2")
    ]
    assert len(plan.basic_references) == 2
    assert plan.basic_references[0] == plan.basic_references[1]
    assert plan.basic_references[0].material_type == "Outros"
    assert plan.complementary_references == ()


def test_ausencia_explicita_retorna_none():
    assert parse(MISSING) is None


def test_negritos_adjacentes_do_editor_preservam_formula_legivel():
    formula = "<p><span><strong>MP = (P<sub>1</sub>+P<sub>2</sub></strong><strong>+P<sub>3</sub></strong></span><b>)/3</b></p>"
    page = PLAN.replace("<p>Média das <b>provas</b>.</p>", formula)
    assert parse(page).assessment_procedures == "**MP = (P1+P2+P3)/3**"


def test_textos_vazios_sao_none_e_tabelas_vazias_sao_tuplas():
    soup = BeautifulSoup(PLAN, "lxml")
    for cell in soup.select("td"):
        cell.clear()
    for body in soup.select("#listaTopicosAula tbody, #listaAvaliacoes tbody"):
        body.clear()
    plan = _parse_teaching_plan(soup)
    assert plan.methodology is None
    assert plan.assessment_procedures is None
    assert plan.office_hours is None
    assert plan.schedule == ()
    assert plan.assessments == ()
    assert plan.basic_references[0].material_type is None
    assert plan.basic_references[0].description is None


@pytest.mark.parametrize(
    "page",
    [
        "<html>Outra tela</html>",
        '<div id="painel-erros"><li>Erro desconhecido.</li></div>',
        PLAN.replace("Referências Complementares", "Tabela mudou"),
        PLAN.replace("Metodologia:", "Campo mudou:"),
        PLAN.replace("03/11/2026", "31/11/2026"),
        PLAN.replace("<td>Material A3</td>", ""),
        PLAN.replace("<tbody></tbody>", ""),
    ],
)
def test_tela_inesperada_nao_e_confundida_com_plano_ausente(page):
    with pytest.raises(SigaaParseError):
        parse(page)


@pytest.mark.parametrize("page", [PLAN, MISSING])
async def test_plano_abre_pelo_menu_com_viewstate_e_confere_contexto(page):
    session = NewsSession(page + CONTEXT, home=HOME)
    resource = Classrooms(session)
    resource._enter_classroom = AsyncMock(
        return_value=Classroom(
            id="AAA",
            number="02",
            semester="2026.2",
            current=True,
            subject=Subject(code="FGA0108", name="MATEMÁTICA DISCRETA 2"),
        )
    )
    result = await resource.get_classroom_teaching_plan("AAA")
    assert result == parse(page)
    resource._enter_classroom.assert_awaited_once_with("AAA", allow_renewal=True)
    assert session.payloads == [
        {
            "formMenu": "formMenu",
            "formMenu:plano99": "formMenu:plano99",
            "javax.faces.ViewState": "estado-atual",
        }
    ]


async def test_contexto_trocado_e_reaberto_antes_de_retornar_ausencia():
    session = NewsSession(
        MISSING + CONTEXT.replace("T02", "T03"), PLAN + CONTEXT, home=HOME
    )
    resource = Classrooms(session)
    resource._enter_classroom = AsyncMock(
        return_value=Classroom(
            id="AAA",
            number="02",
            semester="2026.2",
            current=True,
            subject=Subject(code="FGA0108", name="MATEMÁTICA DISCRETA 2"),
        )
    )
    assert await resource.get_classroom_teaching_plan("AAA") == parse()
    assert resource._enter_classroom.await_count == 2


async def test_sessao_renovada_reabre_turma_e_menu():
    session = NewsSession(PLAN + CONTEXT, home=HOME)
    resource = Classrooms(session)
    classroom = Classroom(
        id="AAA",
        number="02",
        semester="2026.2",
        current=True,
        subject=Subject(code="FGA0108", name="MATEMÁTICA DISCRETA 2"),
    )
    resource._enter_classroom = AsyncMock(side_effect=[SessionRenewed(), classroom])
    assert await resource.get_classroom_teaching_plan("AAA") == parse()
    assert resource._enter_classroom.call_args_list[-1].kwargs == {
        "allow_renewal": False
    }
