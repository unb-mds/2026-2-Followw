import httpx
import pytest
from bs4 import BeautifulSoup

from sigaa_client import (
    PublicSubject,
    SessionExpired,
    SigaaParseError,
    SigaaPublicClient,
    SigaaSearchError,
    SubjectType,
    TeachingLevel,
    Unit,
)
from sigaa_client.config import PUBLIC_HOME_PATH, PUBLIC_SUBJECTS_PATH

FORM = """
<form id="form" action="/sigaa/public/componentes/busca_componentes.jsf">
<input type="hidden" name="form" value="form">
<input type="hidden" name="javax.faces.ViewState" value="view">
<select name="form:nivel"><option value="F">F</option></select>
<select name="form:tipo"><option value="1">ATIVIDADE</option></select>
<select name="form:unidades"><option value="0">Selecione</option>
<option value="673">CAMPUS GAMA</option><option value="672">CAMPUS CEILÂNDIA</option></select>
<input type="checkbox" name="form:checkTipo" checked value="on">
<input type="checkbox" name="form:checkUnidade" checked value="on">
<table><tr><td><input type="checkbox" name="form:checkCodigo" checked value="on">
<input type="text" name="form:generated11" value="OLD"></td></tr>
<tr><td><input type="checkbox" name="form:checkNome" checked value="on">
<input type="text" name="form:generated13" value="OLD"></td></tr></table>
<input type="submit" name="form:buscar" value="Buscar Componentes">
<input type="submit" name="form:cancelar" value="Cancelar">
</form>
"""
ROW = """<tr><td>0003</td><td>COMPILAÇÃO</td><td>DISCIPLINA</td><td>60h</td>
<td><a title="Detalhes do Componente Curricular"
onclick="jsfcljs(x,{'id':'176389'},'');">Detalhes</a></td></tr>"""
RESULTS = (
    '<form id="formListagemComponentes"><table><tr><th>Código</th></tr>'
    + ROW
    + "</table></form>"
)
LIMIT = "A busca excedeu o número máximo de 2000 resultados. Favor refine a sua busca."
EMPTY = "Não foram encontrados resultados para a busca com estes parâmetros."


def notice(text):
    return f'<div id="painel-erros"><ul class="erros"><li>{text}</li></ul></div>'


class FakeSigaa:
    def __init__(self, result=RESULTS, expired=0, details=None, details_expired=0):
        self.result = result
        self.form = FORM
        self.expired = expired
        self.details = details
        self.details_expired = details_expired
        self.paths = []
        self.payloads = []
        self.views = 0

    def __call__(self, request):
        self.paths.append(request.url.path)
        if request.url.path == PUBLIC_HOME_PATH:
            return httpx.Response(
                200, text="home", headers={"set-cookie": "JSESSIONID=public; Path=/"}
            )
        assert request.url.path == PUBLIC_SUBJECTS_PATH
        assert "JSESSIONID=public" in request.headers["cookie"]
        if request.method == "GET":
            self.views += 1
            return httpx.Response(
                200, text=self.form.replace('value="view"', f'value="view{self.views}"')
            )
        payload = dict(httpx.QueryParams(request.content.decode()))
        if "id" in payload:
            assert payload["javax.faces.ViewState"] == "results"
            self.payloads.append(payload)
            if self.details_expired:
                self.details_expired -= 1
                return httpx.Response(302, headers={"location": PUBLIC_HOME_PATH})
            return httpx.Response(200, text=self.details)
        assert payload["javax.faces.ViewState"] == f"view{self.views}"
        self.payloads.append(payload)
        if self.expired:
            self.expired -= 1
            return httpx.Response(302, headers={"location": PUBLIC_HOME_PATH})
        return httpx.Response(200, text=self.result)


async def search(fake, **kwargs):
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        return await client.subjects.search(**kwargs)


async def test_padroes_limpam_filtros_anteriores_e_leem_a_identidade():
    fake = FakeSigaa()
    result = await search(fake)
    payload = fake.payloads[0]
    assert fake.paths[0] == PUBLIC_HOME_PATH
    assert payload["form:nivel"] == "G"
    assert payload["form:tipo"] == payload["form:unidades"] == "0"
    assert payload["form:generated11"] == payload["form:generated13"] == ""
    assert not any("check" in key for key in payload)
    assert payload["form:buscar"] == "Buscar Componentes"
    assert "form:cancelar" not in payload
    assert result.returned_count == 1
    assert result.items[0].sigaa_id == 176389
    assert result.items[0].code == "0003"
    assert result.items[0].hours == 60
    assert result.messages == ()
    assert not result.truncated


@pytest.mark.parametrize("level", ["F", "G", "L", "R", "S"])
@pytest.mark.parametrize(
    "type,value",
    [
        (SubjectType.DISCIPLINA, "2"),
        (SubjectType.ATIVIDADE, "1"),
        (SubjectType.BLOCO, "4"),
        (SubjectType.MODULO, "3"),
    ],
)
async def test_filtros_combinados(level, type, value):
    fake = FakeSigaa()
    result = await search(
        fake, level=level, type=type, code="0003", name="compilação", unit="gama"
    )
    payload = fake.payloads[0]
    assert payload["form:nivel"] == level
    assert result.items[0].level == level
    assert payload["form:tipo"] == value
    assert payload["form:unidades"] == "673"
    assert payload["form:generated11"] == "0003"
    assert payload["form:generated13"] == "compilação"
    assert all(
        payload[f"form:check{field}"] == "on"
        for field in ("Tipo", "Codigo", "Nome", "Unidade")
    )


@pytest.mark.parametrize(
    "kwargs,check",
    [
        ({"code": "0003"}, "Codigo"),
        ({"name": "compilação"}, "Nome"),
        ({"type": SubjectType.MODULO}, "Tipo"),
        ({"unit": 673}, "Unidade"),
    ],
)
async def test_checkboxes_independentes(kwargs, check):
    fake = FakeSigaa()
    await search(fake, **kwargs)
    assert {key for key in fake.payloads[0] if "check" in key} == {f"form:check{check}"}


@pytest.mark.parametrize(
    "unit", [673, "673", " GAMA ", Unit(id=673, name="GAMA"), "ceilandia"]
)
async def test_resolve_unidades(unit):
    fake = FakeSigaa()
    await search(fake, unit=unit)
    assert fake.payloads[0]["form:unidades"] == (
        "672" if unit == "ceilandia" else "673"
    )


@pytest.mark.parametrize(
    "kwargs",
    [
        {"level": "E"},
        {"level": "D"},
        {"type": "bad"},
        {"code": " "},
        {"name": ""},
        {"unit": " "},
        {"unit": "campus"},
        {"unit": 999},
        {"unit": "absent"},
    ],
)
async def test_filtros_invalidos(kwargs):
    fake = FakeSigaa()
    with pytest.raises(SigaaSearchError):
        await search(fake, **kwargs)
    assert not fake.payloads


async def test_avisos_preservados():
    result = await search(FakeSigaa(notice(LIMIT) + RESULTS))
    assert result.truncated and result.returned_count == 1
    assert result.messages[0].text == LIMIT
    assert result.messages[0].code == "result_limit_exceeded"
    empty = await search(FakeSigaa(notice(EMPTY)))
    assert empty.items == () and not empty.truncated
    assert empty.messages[0].code == "no_results"
    with pytest.raises(SigaaSearchError, match="Obrigatório"):
        await search(FakeSigaa(notice(EMPTY) + notice("Obrigatório")))


@pytest.mark.parametrize(
    "result",
    [
        "",
        RESULTS.replace("60h", "unknown"),
        RESULTS.replace("DISCIPLINA", "UNKNOWN"),
        RESULTS.replace("'176389'", "'0'"),
        RESULTS.replace("<td>60h</td>", ""),
        RESULTS.replace(ROW, ""),
    ],
)
async def test_resultados_malformados(result):
    with pytest.raises(SigaaParseError):
        await search(FakeSigaa(result))


@pytest.mark.parametrize("hours,expected", [("0h", 0), ("-", None), ("", None)])
async def test_carga_horaria_opcional(hours, expected):
    result = await search(FakeSigaa(RESULTS.replace("60h", hours)))
    assert result.items[0].hours == expected


async def test_nova_tentativa_renova_a_view_uma_vez():
    fake = FakeSigaa(expired=1)
    assert (await search(fake)).returned_count == 1
    assert fake.views == 2
    fake = FakeSigaa(expired=2)
    with pytest.raises(SessionExpired):
        await search(fake)
    assert len(fake.payloads) == 2


async def test_ids_e_nao_codigos_definem_a_identidade():
    result = await search(
        FakeSigaa(RESULTS.replace(ROW, ROW + ROW.replace("176389", "176390")))
    )
    assert [item.sigaa_id for item in result.items] == [176389, 176390]


@pytest.mark.parametrize(
    "field",
    [
        "javax.faces.ViewState",
        "form:nivel",
        "form:tipo",
        "form:unidades",
        "form:checkTipo",
        "form:checkUnidade",
        "form:checkCodigo",
        "form:checkNome",
        "form:generated11",
        "form:generated13",
        "form:buscar",
    ],
)
async def test_campos_ausentes_do_formulario_falham_antes_do_envio(field):
    fake = FakeSigaa()
    form = BeautifulSoup(FORM, "lxml")
    form.find(attrs={"name": field}).decompose()
    fake.form = str(form)
    with pytest.raises(SigaaParseError):
        await search(fake)
    assert not fake.payloads


async def test_truncamento_depende_do_aviso_e_nao_da_contagem():
    rows = "".join(ROW.replace("176389", str(index + 1)) for index in range(2000))
    result = await search(FakeSigaa(RESULTS.replace(ROW, rows)))
    assert result.returned_count == 2000
    assert result.truncated is False
    assert result.messages == ()


DETAILS_RESULTS = (
    '<form id="formListagemComponentes" action="/sigaa/public/componentes/busca_componentes.jsf">'
    '<input type="hidden" name="javax.faces.ViewState" value="results">'
    "<table><tr><th>Código</th></tr>"
    + ROW.replace("176389", "176390").replace("0003", "00030")
    + ROW
    + "</table></form>"
)
DETAILS = """
<table class="visualizacao">
  <tr><th>Código:</th><td>0003</td></tr>
  <tr><th>Pré-Requisitos:</th><td>
    ( ( <acronym title="CIC0004 - X">CIC0004</acronym> ) OU ( CIC0088 ) )
  </td></tr>
  <tr><th>Co-Requisitos:</th><td>-</td></tr>
  <tr><th>Equivalências:</th><td>( CIC0099 )</td></tr>
  <tr><td colspan="2"><table class="subFormulario">
    <tr><td>Total de Carga Horária do Componente</td><td><b>90h</b></td></tr>
  </table></td></tr>
</table>
"""
COMPILATION = PublicSubject(
    code="0003",
    sigaa_id=176389,
    name="COMPILAÇÃO",
    hours=60,
    level=TeachingLevel.GRADUACAO,
    type=SubjectType.DISCIPLINA,
)


async def details(fake):
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        return await client.subjects.get_details(COMPILATION)


async def test_resumo_traz_requisitos_e_carga_horaria_do_componente_pelo_id():
    fake = FakeSigaa(DETAILS_RESULTS, details=DETAILS)
    subject = await details(fake)
    assert subject.model_dump() == {
        "code": "0003",
        "sigaa_id": 176389,
        "name": "COMPILAÇÃO",
        "hours": 90,
        "unit": None,
        "prerequisites": "( ( CIC0004 ) OU ( CIC0088 ) )",
        "corequisites": None,
        "equivalences": "( CIC0099 )",
    }
    search, postback = fake.payloads
    assert search["form:generated11"] == "0003"
    assert postback["id"] == "176389"


async def test_componente_sem_link_de_detalhes_e_barulhento():
    fake = FakeSigaa(DETAILS_RESULTS.replace("176389", "1"), details=DETAILS)
    with pytest.raises(SigaaParseError, match="sem link de detalhes"):
        await details(fake)


async def test_sessao_expirada_no_resumo_refaz_a_busca_uma_vez():
    fake = FakeSigaa(DETAILS_RESULTS, details=DETAILS, details_expired=1)
    assert (await details(fake)).prerequisites == "( ( CIC0004 ) OU ( CIC0088 ) )"
    assert fake.views == 2
