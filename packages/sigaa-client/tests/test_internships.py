from datetime import datetime
from decimal import Decimal

import httpx
import pytest

from sigaa_client import Credentials, InternshipNotFound, SigaaClient, SigaaParseError

MENU = """
<form id="menu:form_menu_discente" name="menu:form_menu_discente"
 action="/sigaa/portais/discente/discente.jsf" method="post">
 <input name="menu:form_menu_discente" value="menu:form_menu_discente" type="hidden">
 <input name="jscook_action" type="hidden">
 <input name="javax.faces.ViewState" value="MENU" type="hidden">
</form>
"""

# Estrutura recortada do mural; nomes, valores e responsáveis são sintéticos.
ROW = """
<tr class="linhaPar"><td>{title}</td><td>1</td><td>R$ 1.860,00</td>
 <td>23/11/2026 22:00</td><td>
 <a href="#" title="Visualizar Oferta de Estágio" onclick="jsfcljs(
 document.getElementById('form'),{{'{component}':'{component}'}},'');return false">
 <img alt="Visualizar Oferta de Estágio" src="/sigaa/img/view.gif"></a>
 </td></tr>
"""


def board(my_rows: str, other_rows: str = "") -> str:
    return f"""
    <form id="form" name="form" action="/sigaa/estagio/oferta_estagio/lista.jsf">
     <input name="form" value="form" type="hidden">
     <table id="listagem_meu_curso"><thead><tr><th>Título</th></tr></thead>
      <tbody>{my_rows}</tbody></table>
     <table id="listagem_outros_cursos"><thead><tr><th>Título</th></tr></thead>
      <tbody>{other_rows}</tbody></table>
     <input name="javax.faces.ViewState" value="MURAL" type="hidden">
    </form>
    """


MY_ROW = ROW.format(title="ESTÁGIO EM SOFTWARE", component="form:j_id_31")
OTHER_ROW = ROW.format(title="ESTÁGIO EM SOFTWARE", component="form:j_id_63")
BOARD = board(MY_ROW, OTHER_ROW)

DETAIL = """
<table class="visualizacao"><caption>Dados da Oferta de Estágio</caption>
 <tr><td class="subFormulario" colspan="4">Dados do Concedente do Estágio</td></tr>
 <tr><th>Tipo do Convênio:</th><td colspan="3">ESTÁGIO CURRICULAR</td></tr>
 <tr><th>CNPJ:</th><td colspan="3">00.000.000/0001-00</td></tr>
 <tr><th>Nome:</th><td colspan="3">EMPRESA EXEMPLO</td></tr>
 <tr><th>Responsável:</th><td colspan="3">PESSOA UM</td></tr>
 <tr><th>Responsável:</th><td colspan="3">PESSOA DOIS</td></tr>
 <tr><td class="subFormulario" colspan="4">Dados da Oferta de Estágio</td></tr>
 <tr><th>Título:</th><td colspan="3">ESTÁGIO EM SOFTWARE</td></tr>
 <tr><th>Número de Vagas:</th><td colspan="3">1</td></tr>
 <tr><th>Valor da Bolsa:</th><td>R$ 1.860,00</td>
     <th>Aux. Transporte:</th><td>R$ 15,00 ao dia</td></tr>
 <tr><th>Início da Publicação:</th><td>30/10/2026 09:00</td>
     <th>Fim da Publicação:</th><td>23/11/2026 22:00</td></tr>
 <tr><th>Permitir inscrição via SIGAA:</th><td colspan="3">Não</td></tr>
 <form id="formArquivo" action="/sigaa/estagio/oferta_estagio/view.jsf">
 <input name="formArquivo" type="hidden">
 <tr><th>Arquivo:</th><td colspan="3"><div></div></td></tr>
 </form>
 <tr><td class="subFormulario" colspan="4">Cursos para os quais as vagas serão Ofertadas</td></tr>
 <tr><td colspan="4"><table class="listagem"><thead><tr><th>Cursos</th></tr></thead>
  <tbody><tr><td>ENGENHARIA DE SOFTWARE/FCTE - Bacharelado</td></tr>
  <tr><td>COMPUTAÇÃO/CIC - Licenciatura</td></tr></tbody></table></td></tr>
 <tr><td class="subFormulario" colspan="4">Descrição detalhada da Oferta</td></tr>
 <tr><td colspan="4"><div><p>Vaga de <strong>estágio</strong>.</p>
 <ul><li>Desenvolver software</li></ul>
 <a href="https://example.org/vaga">Detalhes</a></div></td></tr>
</table>
"""


class FakeSigaa:
    def __init__(self):
        self.board = BOARD
        self.detail = DETAIL
        self.requests = []
        self.expire_on = None
        self.renewed = False
        self.step = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.url.host == "autenticacao.unb.br":
            if request.method == "GET":
                return httpx.Response(
                    200,
                    text='<form action="/sso-server/login"><input name="u" type="text"><input name="p" type="password"></form>',
                )
            return httpx.Response(
                302, headers={"location": "https://sigaa.unb.br/sigaa/login/cas"}
            )
        if request.url.path == "/sigaa/login/cas":
            self.renewed = True
            self.step = 0
            return httpx.Response(
                302,
                headers={
                    "location": "/sigaa/portais/discente/discente.jsf",
                    "set-cookie": "JSESSIONID=novo; Path=/",
                },
            )
        if request.url.path == "/sigaa/verTelaLogin.do":
            return httpx.Response(200, text="Login")
        if request.method == "GET":
            assert request.url.path == "/sigaa/portais/discente/discente.jsf"
            return httpx.Response(
                200, text=MENU.replace("MENU", "MENU_NOVO") if self.renewed else MENU
            )
        payload = dict(httpx.QueryParams(request.content.decode()))
        self.step += 1
        if self.expire_on == self.step and not self.renewed:
            return httpx.Response(302, headers={"location": "/sigaa/verTelaLogin.do"})
        if "jscook_action" in payload:
            assert (
                payload["jscook_action"]
                == "menu_form_menu_discente_discente_menu:A]#{ ofertaEstagioMBean.listarOfertasDisponiveis }"
            )
            assert payload["javax.faces.ViewState"] == (
                "MENU_NOVO" if self.renewed else "MENU"
            )
            assert payload["menu:form_menu_discente"] == "menu:form_menu_discente"
            return httpx.Response(
                200,
                text=self.board.replace("MURAL", "MURAL_NOVO")
                if self.renewed
                else self.board,
            )
        assert request.url.path == "/sigaa/estagio/oferta_estagio/lista.jsf"
        assert payload["javax.faces.ViewState"] == (
            "MURAL_NOVO" if self.renewed else "MURAL"
        )
        assert payload["form"] == "form"
        assert (
            payload.get("form:j_id_31") == "form:j_id_31"
            or payload.get("form:j_id_63") == "form:j_id_63"
        )
        return httpx.Response(200, text=self.detail)


def client_for(sigaa):
    return SigaaClient(session_token="antigo", transport=httpx.MockTransport(sigaa))


async def test_lista_as_duas_tabelas_sem_confundir_titulos_repetidos():
    sigaa = FakeSigaa()
    async with client_for(sigaa) as client:
        items = await client.internships.list_internships()
    assert len(items) == 2
    assert items[0].reference != items[1].reference
    assert all(item.sigaa_id is None for item in items)
    assert items[0].stipend == Decimal("1860.00")
    assert items[0].vacancies == 1
    assert items[0].published_until == datetime(2026, 11, 23, 22)
    assert [request.method for request in sigaa.requests] == ["GET", "POST"]


async def test_filtra_as_ofertas_do_meu_curso():
    sigaa = FakeSigaa()
    sigaa.board = board(MY_ROW, "<tr><td>Oferta inválida</td></tr>")
    async with client_for(sigaa) as client:
        items = await client.internships.list_internships(only_my_course=True)
    assert len(items) == 1
    assert items[0].title == "ESTÁGIO EM SOFTWARE"


async def test_mural_vazio_retorna_lista_vazia():
    sigaa = FakeSigaa()
    sigaa.board = board("")
    async with client_for(sigaa) as client:
        assert await client.internships.list_internships() == []


async def test_consulta_detalhe_com_payload_completo_e_markdown():
    sigaa = FakeSigaa()
    async with client_for(sigaa) as client:
        summary = (await client.internships.list_internships())[0]
        detail = await client.internships.get_internship(summary.reference)
    assert detail.model_dump(mode="json") == {
        "sigaa_id": None,
        "title": "ESTÁGIO EM SOFTWARE",
        "vacancies": 1,
        "stipend": "1860.00",
        "transport_allowance": {"amount": "15.00", "period": "ao dia"},
        "published_from": "2026-10-30T09:00:00",
        "published_until": "2026-11-23T22:00:00",
        "sigaa_enrollment": False,
        "attachment": None,
        "grantor": {
            "agreement_type": "ESTÁGIO CURRICULAR",
            "cnpj": "00.000.000/0001-00",
            "name": "EMPRESA EXEMPLO",
            "responsibles": ["PESSOA UM", "PESSOA DOIS"],
        },
        "courses": [
            {"name": "ENGENHARIA DE SOFTWARE", "unit": "FCTE", "degree": "Bacharelado"},
            {"name": "COMPUTAÇÃO", "unit": "CIC", "degree": "Licenciatura"},
        ],
        "description": "Vaga de **estágio**.\n\n- Desenvolver software\n\n[Detalhes](https://example.org/vaga)",
    }


@pytest.mark.parametrize("transport", ["R$ 0,00 ao dia", "", "R$ 0,00 ao mês"])
async def test_transporte_zero_ou_vazio_retorna_nulo(transport):
    sigaa = FakeSigaa()
    sigaa.detail = DETAIL.replace("R$ 15,00 ao dia", transport)
    async with client_for(sigaa) as client:
        summary = (await client.internships.list_internships())[0]
        assert (
            await client.internships.get_internship(summary.reference)
        ).transport_allowance is None


async def test_campos_opcionais_vazios_e_inscricao_permitida():
    sigaa = FakeSigaa()
    sigaa.board = BOARD.replace("R$ 1.860,00", "")
    sigaa.detail = DETAIL.replace("R$ 1.860,00", "").replace(">Não<", ">Sim<")
    sigaa.detail = sigaa.detail.replace(
        '<div><p>Vaga de <strong>estágio</strong>.</p>\n <ul><li>Desenvolver software</li></ul>\n <a href="https://example.org/vaga">Detalhes</a></div>',
        "<div><p><br></p></div>",
    )
    async with client_for(sigaa) as client:
        summary = (await client.internships.list_internships())[0]
        detail = await client.internships.get_internship(summary.reference)
    assert summary.stipend is None
    assert detail.stipend is None
    assert detail.description is None
    assert detail.sigaa_enrollment is True


async def test_referencia_expirada_nao_abre_outra_vaga():
    sigaa = FakeSigaa()
    async with client_for(sigaa) as client:
        summary = (await client.internships.list_internships())[0]
        sigaa.board = BOARD.replace("ESTÁGIO EM SOFTWARE", "OUTRA VAGA")
        with pytest.raises(InternshipNotFound, match="liste novamente"):
            await client.internships.get_internship(summary.reference)
    assert len(sigaa.requests) == 4


async def test_reordenacao_do_mural_invalida_referencia():
    sigaa = FakeSigaa()
    second = MY_ROW.replace("ESTÁGIO EM SOFTWARE", "OUTRA VAGA")
    sigaa.board = board(MY_ROW + second)
    async with client_for(sigaa) as client:
        summary = (await client.internships.list_internships())[0]
        sigaa.board = board(second + MY_ROW)
        with pytest.raises(InternshipNotFound):
            await client.internships.get_internship(summary.reference)


async def test_detalhe_recusa_resumo_repetido_na_mesma_tabela():
    sigaa = FakeSigaa()
    sigaa.board = board(MY_ROW + MY_ROW.replace("form:j_id_31", "form:j_id_32"))
    async with client_for(sigaa) as client:
        items = await client.internships.list_internships()
        assert len(items) == 2
        with pytest.raises(InternshipNotFound, match="ambígua"):
            await client.internships.get_internship(items[0].reference)
    assert len(sigaa.requests) == 4


async def test_consulta_vaga_de_outro_curso():
    sigaa = FakeSigaa()
    async with client_for(sigaa) as client:
        summary = (await client.internships.list_internships())[1]
        sigaa.board = board("<tr><td>Oferta inválida</td></tr>", OTHER_ROW)
        detail = await client.internships.get_internship(summary.reference)
    assert detail.title == summary.title


async def test_detalhe_usa_viewstate_do_formulario_do_mural():
    sigaa = FakeSigaa()
    sigaa.board = MENU + BOARD
    async with client_for(sigaa) as client:
        summary = (await client.internships.list_internships())[0]
        detail = await client.internships.get_internship(summary.reference)
    assert detail.title == summary.title


async def test_listagem_recupera_sessao_expirada_no_menu():
    sigaa = FakeSigaa()
    sigaa.expire_on = 1
    async with SigaaClient(
        Credentials(registration="251000000", password="senha"),
        session_token="antigo",
        transport=httpx.MockTransport(sigaa),
    ) as client:
        items = await client.internships.list_internships()
    assert sigaa.renewed
    assert len(items) == 2


@pytest.mark.parametrize("step", [1, 2])
async def test_refaz_navegacao_com_viewstate_novo_apos_relogin(step):
    sigaa = FakeSigaa()
    async with client_for(sigaa) as client:
        summary = (await client.internships.list_internships())[0]
    sigaa.requests.clear()
    sigaa.step = 0
    sigaa.expire_on = step
    async with SigaaClient(
        Credentials(registration="251000000", password="senha"),
        session_token="antigo",
        transport=httpx.MockTransport(sigaa),
    ) as client:
        detail = await client.internships.get_internship(summary.reference)
    assert sigaa.renewed
    assert detail.title == summary.title


@pytest.mark.parametrize(
    "old,new,match",
    [
        ("R$ 15,00 ao dia", "quinze reais", "transporte"),
        ("R$ 15,00 ao dia", "R$ 15,00", "período"),
        ("R$ 1.860,00", "R$ abc", "monetário"),
        (">Não<", ">Talvez<", "Inscrição"),
        ("30/10/2026 09:00", "31/02/2026 09:00", "início"),
        ("ENGENHARIA DE SOFTWARE/FCTE - Bacharelado", "Curso sem unidade", "Curso"),
        ("<th>CNPJ:</th>", "<th>Outro:</th>", "CNPJ"),
        ("ESTÁGIO EM SOFTWARE", "VAGA ERRADA", "diverge"),
    ],
)
async def test_layout_ou_dado_invalido_levanta_erro_descritivo(old, new, match):
    sigaa = FakeSigaa()
    sigaa.detail = DETAIL.replace(old, new)
    async with client_for(sigaa) as client:
        summary = (await client.internships.list_internships())[0]
        with pytest.raises(SigaaParseError, match=match):
            await client.internships.get_internship(summary.reference)


async def test_mural_sem_tabela_levanta_erro():
    sigaa = FakeSigaa()
    sigaa.board = "<h2>Página inesperada</h2>"
    async with client_for(sigaa) as client:
        with pytest.raises(SigaaParseError, match="listagem_meu_curso"):
            await client.internships.list_internships()


@pytest.mark.parametrize("href", ["/sigaa/arquivo.pdf", "javascript:alert(1)", "#"])
async def test_anexo_exige_url_valida(href):
    sigaa = FakeSigaa()
    sigaa.detail = DETAIL.replace(
        "<div></div>", f'<div><a href="{href}">edital.pdf</a></div>'
    )
    async with client_for(sigaa) as client:
        summary = (await client.internships.list_internships())[0]
        if href.startswith("/"):
            detail = await client.internships.get_internship(summary.reference)
            assert detail.attachment.name == "edital.pdf"
            assert detail.attachment.url == "https://sigaa.unb.br/sigaa/arquivo.pdf"
        else:
            with pytest.raises(SigaaParseError, match="Arquivo"):
                await client.internships.get_internship(summary.reference)
