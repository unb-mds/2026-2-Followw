import httpx
import pytest

from sigaa_client import (
    SigaaParseError,
    SigaaPublicClient,
    SigaaSearchError,
    TeachingLevel,
)
from sigaa_client.config import PUBLIC_CLASSROOMS_PATH, PUBLIC_HOME_PATH

SEARCH_FORM = """
<html><body><form id="formTurma" name="formTurma" method="post"
  action="/sigaa/public/turmas/listar.jsf">
  <input type="hidden" name="formTurma" value="formTurma" />
  <select name="formTurma:inputNivel">
    <option value=""> -- SELECIONE -- </option>
    <option value="G">GRADUAÇÃO</option>
  </select>
  <select name="formTurma:inputDepto">
    <option value="0" selected="selected"> -- SELECIONE -- </option>
    <option value="672">CAMPUS UNB CEILÂNDIA: FACULDADE DE CIÊNCIAS - BRASÍLIA</option>
    <option value="673">CAMPUS UNB GAMA: FACULDADE DE CIÊNCIAS - BRASÍLIA</option>
  </select>
  <input type="text" name="formTurma:inputAno" value="2026" />
  <select name="formTurma:inputPeriodo">
    <option value="1">1</option><option value="2" selected="selected">2</option>
  </select>
  <input type="submit" name="formTurma:j_id_jsp_1370969402_11" value="Buscar" />
  <input type="submit" name="formTurma:j_id_jsp_1370969402_12" value="Cancelar" />
  <input type="hidden" name="javax.faces.ViewState" value="j_id2" />
</form></body></html>
"""

RESULTS = """
<html><body><form id="formTurma" name="formTurma" method="post"
  action="/sigaa/public/turmas/listar.jsf">
  <input type="hidden" name="formTurma" value="formTurma" />
  <input type="hidden" name="javax.faces.ViewState" value="j_id3" />
<table class="listagem">
  <tr><th>Código</th></tr>
  <tr class="agrupador"><td colspan="8">
    <a id="formTurma:aqui" href="#"
      onclick="jsfcljs(x,{'formTurma:aqui':'formTurma:aqui','id':'176617','publico':'public'},'');"
    ><span class="tituloDisciplina">FGA0030 - ESTRUTURAS DE DADOS 2</span></a>
  </td></tr>
  <tr class="linhaPar">
    <td class="turma" align="center"> 01</td>
    <td class="anoPeriodo" align="center">2026.2</td>
    <td class="nome">GLAUCO VITOR PEDROSA (30h)<br/>JOHN LENON GARDENGHI (30h)<br/></td>
    <td> 35M12 (10/08/2026 - 14/12/2026)
      <span><div class="popUp" id="ajuda1">Terça-feira 08:00 às 09:50</div></span>
    </td>
    <td> </td>
    <td style="text-align: center;">100</td>
    <td style="text-align: center;">97</td>
    <td nowrap="nowrap" align="center"> FCTE - S3</td>
  </tr>
  <tr class="linhaImpar">
    <td class="turma" align="center"> 02</td>
    <td class="anoPeriodo" align="center">2026.2</td>
    <td class="nome">A DEFINIR DOCENTE</td>
    <td> 24T23</td>
    <td> </td>
    <td style="text-align: center;">50</td>
    <td style="text-align: center;"> </td>
    <td nowrap="nowrap" align="center"> A DEFINIR</td>
  </tr>
  <tr class="linhaPar">
    <td class="turma" align="center"> 03</td>
    <td class="anoPeriodo" align="center">2026.2</td>
    <td class="nome"></td>
    <td> 24T23</td>
    <td> </td>
    <td style="text-align: center;">50</td>
    <td style="text-align: center;"> </td>
    <td nowrap="nowrap" align="center"> </td>
  </tr>
</table></form></body></html>
"""

SECOND_SUBJECT = """
  <tr class="agrupador"><td colspan="8">
    <a id="formTurma:aquij_id_1" href="#"
      onclick="jsfcljs(x,{'formTurma:aquij_id_1':'formTurma:aquij_id_1','id':'176618','publico':'public'},'');"
    ><span class="tituloDisciplina">FGA0031 - ESTRUTURAS DE DADOS 3</span></a>
  </td></tr>
  <tr class="linhaPar">
    <td class="turma" align="center"> 01</td>
    <td class="anoPeriodo" align="center">2026.2</td>
    <td class="nome">GLAUCO VITOR PEDROSA (30h)</td>
    <td> 35M12</td>
    <td> </td>
    <td style="text-align: center;">50</td>
    <td style="text-align: center;">10</td>
    <td nowrap="nowrap" align="center"> FCTE - S4</td>
  </tr>
</table>"""

TWO_SUBJECTS = RESULTS.replace("</table>", SECOND_SUBJECT)


def details_page(code, name, *, pre="-", co="-", equivalences="-", total="60h"):
    return f"""
<html><body><table class="visualizacao" width="100%">
  <caption>Dados Gerais do Componente Curricular</caption>
  <tr><th>Código:</th><td>{code}</td></tr>
  <tr><th>Nome:</th><td>{name}</td></tr>
  <tr><th>Pré-Requisitos:</th><td>
    {pre}
  </td></tr>
  <tr><th>Co-Requisitos:</th><td>{co}</td></tr>
  <tr><th>Equivalências:</th><td>
    {equivalences}
  </td></tr>
  <tr><td colspan="2"><table class="subFormulario">
    <caption>Cargas Horárias</caption>
    <tr><td class="box">Subtotal de Carga Horária de Aula<div class="popUp">x</div></td>
      <td><b>30h</b></td></tr>
    <tr><td class="box">Total de Carga Horária do Componente<div class="popUp">y</div></td>
      <td><b>{total}</b></td></tr>
  </table></td></tr>
</table>
<table class="subFormulario"><caption>Histórico de Equivalências</caption>
  <tr><td>( <acronym title="a">OLD0001</acronym> )</td><td> INATIVO</td></tr>
</table></body></html>
"""


def acronym(code):
    return f'<acronym title="{code} - X">{code}</acronym>'


DETAILS = {
    "176617": details_page(
        "FGA0030",
        "ESTRUTURAS DE DADOS 2",
        pre=f"( ( {acronym('FGA0029')} E {acronym('MAT0025')} ) OU ( {acronym('CIC0090')} ) )",
        co=f"( {acronym('FGA0031')} )",
        equivalences=f"( {acronym('FGA0001')} )",
        total="90h",
    ),
    "176618": details_page("FGA0031", "ESTRUTURAS DE DADOS 3"),
}

EMPTY = """
<html><body><ul class="erros">
  <li>Não foram encontrados resultados para a busca com estes parâmetros.</li>
</ul></body></html>
"""

REJECTED = """
<html><body><ul class="erros">
  <li>Unidade: Campo obrigatório não informado.</li>
</ul></body></html>
"""


class FakePublicSigaa:
    """SIGAA público de mentira: só aceita o submit de quem passou pela home."""

    def __init__(
        self,
        result: str = RESULTS,
        expired_submits: int = 0,
        details: dict[str, str] | None = None,
        expired_details: int = 0,
    ) -> None:
        self.result = result
        self.details = details or DETAILS
        # Submits que a sessão descarta antes de voltar a funcionar.
        self.expired_submits = expired_submits
        # O mesmo, só nos postbacks de detalhes (a sessão morre depois da busca).
        self.expired_details = expired_details
        self.warm = False
        self.payloads: list[dict[str, str]] = []
        self.paths: list[str] = []

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        self.paths.append(path)

        if path == PUBLIC_HOME_PATH:
            self.warm = True
            return httpx.Response(200, text="<html><body>home</body></html>")

        if request.method == "GET":
            return httpx.Response(200, text=SEARCH_FORM)

        self.payloads.append(dict(httpx.QueryParams(request.content.decode())))
        if not self.warm or self.expired_submits:
            self.expired_submits = max(self.expired_submits - 1, 0)
            return httpx.Response(
                302, headers={"location": f"https://sigaa.unb.br{PUBLIC_HOME_PATH}"}
            )

        if "id" in self.payloads[-1]:
            if self.expired_details:
                self.expired_details -= 1
                self.warm = False
                return httpx.Response(
                    302,
                    headers={"location": f"https://sigaa.unb.br{PUBLIC_HOME_PATH}"},
                )
            return httpx.Response(200, text=self.details[self.payloads[-1]["id"]])
        return httpx.Response(200, text=self.result)


async def test_busca_passa_pela_home_antes_do_submit():
    sigaa = FakePublicSigaa()

    async with SigaaPublicClient(transport=sigaa.transport) as client:
        await client.classrooms.search(673)

    assert sigaa.paths[0] == PUBLIC_HOME_PATH
    assert sigaa.paths[1:] == [PUBLIC_CLASSROOMS_PATH, PUBLIC_CLASSROOMS_PATH]


async def test_payload_leva_viewstate_botao_e_defaults_do_form():
    sigaa = FakePublicSigaa()

    async with SigaaPublicClient(transport=sigaa.transport) as client:
        await client.classrooms.search(673, level=TeachingLevel.GRADUACAO)

    payload = sigaa.payloads[0]
    assert payload["javax.faces.ViewState"] == "j_id2"
    # O `name` do botão é gerado pelo JSF: tem que sair do DOM, não do código.
    assert payload["formTurma:j_id_jsp_1370969402_11"] == "Buscar"
    assert "formTurma:j_id_jsp_1370969402_12" not in payload
    assert payload["formTurma:inputNivel"] == "G"
    assert payload["formTurma:inputDepto"] == "673"
    # Sem ano/período explícitos vale o semestre que o próprio form trouxe.
    assert (payload["formTurma:inputAno"], payload["formTurma:inputPeriodo"]) == (
        "2026",
        "2",
    )


async def test_unidade_pode_vir_pelo_nome():
    sigaa = FakePublicSigaa()

    async with SigaaPublicClient(transport=sigaa.transport) as client:
        await client.classrooms.search("gama")

    assert sigaa.payloads[0]["formTurma:inputDepto"] == "673"


async def test_nome_ambiguo_de_unidade_e_barulhento():
    sigaa = FakePublicSigaa()

    async with SigaaPublicClient(transport=sigaa.transport) as client:
        with pytest.raises(SigaaSearchError, match="casa com 2 unidades"):
            await client.classrooms.search("campus unb")


async def test_resultado_agrupa_turmas_sob_o_componente():
    sigaa = FakePublicSigaa()

    async with SigaaPublicClient(transport=sigaa.transport) as client:
        turmas = await client.classrooms.search(673)

    primeira, segunda, terceira = turmas
    assert (primeira.number, primeira.semester) == ("01", "2026.2")
    assert (primeira.subject.code, primeira.subject.sigaa_id) == ("FGA0030", 176617)
    # O balão de ajuda não pode vazar para o código do horário.
    assert primeira.schedule == "35M12"
    assert primeira.schedule_description == "Terça-feira 08:00 às 09:50"
    assert (primeira.subject.unity, primeira.room) == ("FCTE", "S3")
    assert (primeira.vacancies, primeira.occupied) == (100, 97)

    assert [(t.name, t.hours) for t in primeira.teachers] == [
        ("GLAUCO VITOR PEDROSA", 30),
        ("JOHN LENON GARDENGHI", 30),
    ]
    # A CH do componente é a soma das horas dos docentes na turma.
    assert primeira.subject.hours == 60

    # Turma sem docente alocado: o SIGAA põe um nome de fachada, que passa reto.
    assert [(t.name, t.hours) for t in segunda.teachers] == [
        ("A DEFINIR DOCENTE", None)
    ]
    assert (segunda.subject.hours, segunda.occupied) == (None, None)
    # "Local" é texto livre: sem o ` - ` não há unidade a separar da sala.
    assert (segunda.subject.unity, segunda.room) == (None, "A DEFINIR")

    assert terceira.teachers == ()
    assert (terceira.subject.unity, terceira.room) == (None, None)


async def test_busca_sem_resultado_devolve_lista_vazia():
    sigaa = FakePublicSigaa(result=EMPTY)

    async with SigaaPublicClient(transport=sigaa.transport) as client:
        assert await client.classrooms.search(673, year=1900) == []


async def test_filtro_recusado_vira_erro_com_a_mensagem_do_sigaa():
    sigaa = FakePublicSigaa(result=REJECTED)

    async with SigaaPublicClient(transport=sigaa.transport) as client:
        with pytest.raises(SigaaSearchError, match="Campo obrigatório"):
            await client.classrooms.search(0)


async def test_sessao_expirada_refaz_a_busca_do_zero():
    """O `ViewState` da mão morre junto com a sessão: não dá para só repostar."""
    sigaa = FakePublicSigaa(expired_submits=1)

    async with SigaaPublicClient(transport=sigaa.transport) as client:
        turmas = await client.classrooms.search(673)

    assert len(turmas) == 3
    # Form relido do zero: o segundo submit não reaproveita o `ViewState` morto.
    assert sigaa.paths.count(PUBLIC_CLASSROOMS_PATH) == 4
    assert len(sigaa.payloads) == 2


async def test_lista_unidades_ignora_o_placeholder():
    sigaa = FakePublicSigaa()

    async with SigaaPublicClient(transport=sigaa.transport) as client:
        unidades = await client.classrooms.list_units()
        # O filtro ignora acento e caixa: `ceilandia` acha `CEILÂNDIA`.
        ceilandia = await client.classrooms.list_units("ceilandia")

    assert [unidade.id for unidade in unidades] == [672, 673]
    assert [unidade.id for unidade in ceilandia] == [672]


async def _collect(sigaa, **kwargs):
    async with SigaaPublicClient(transport=sigaa.transport) as client:
        return [s async for s in client.classrooms.iter_subjects(673, **kwargs)]


async def test_componentes_trazem_requisitos_e_carga_horaria_dos_detalhes():
    sigaa = FakePublicSigaa(result=TWO_SUBJECTS)

    primeiro, segundo = await _collect(sigaa)

    assert (primeiro.code, primeiro.sigaa_id, primeiro.name) == (
        "FGA0030",
        176617,
        "ESTRUTURAS DE DADOS 2",
    )
    # Os códigos saem dos `<acronym>` e a expressão do SIGAA fica como veio.
    assert primeiro.prerequisites == "( ( FGA0029 E MAT0025 ) OU ( CIC0090 ) )"
    assert primeiro.corequisites == "( FGA0031 )"
    # Só a expressão do resumo: a linha INATIVA do histórico não entra.
    assert primeiro.equivalences == "( FGA0001 )"
    # O total da tela de detalhes vale mais que a soma dos docentes (60h).
    assert (primeiro.hours, primeiro.unity) == (90, "FCTE")

    assert (segundo.prerequisites, segundo.corequisites, segundo.equivalences) == (
        None,
        None,
        None,
    )


async def test_componentes_usam_o_nivel_graduacao_e_postam_o_link_do_componente():
    sigaa = FakePublicSigaa(result=TWO_SUBJECTS)

    await _collect(sigaa)

    assert sigaa.payloads[0]["formTurma:inputNivel"] == "G"
    busca, primeiro, segundo = sigaa.payloads
    assert (primeiro["id"], primeiro["formTurma:aqui"]) == (
        "176617",
        "formTurma:aqui",
    )
    assert segundo["formTurma:aquij_id_1"] == "formTurma:aquij_id_1"
    # A view do resultado é reaproveitada: a busca roda uma única vez.
    assert busca["javax.faces.ViewState"] == "j_id2"
    assert (
        primeiro["javax.faces.ViewState"] == segundo["javax.faces.ViewState"] == "j_id3"
    )
    assert len(sigaa.payloads) == 3


async def test_componente_ja_coletado_nao_e_aberto_de_novo():
    sigaa = FakePublicSigaa(result=TWO_SUBJECTS)

    subjects = await _collect(sigaa, skip={"FGA0030"})

    assert [s.code for s in subjects] == ["FGA0031"]
    assert [p.get("id") for p in sigaa.payloads[1:]] == ["176618"]


async def test_busca_sem_resultado_nao_tem_componentes():
    sigaa = FakePublicSigaa(result=EMPTY)

    assert await _collect(sigaa) == []


async def test_detalhes_de_outro_componente_sao_barulhentos():
    """O contexto vive na sessão: a tela pode ser de outro componente."""
    sigaa = FakePublicSigaa(
        details={**DETAILS, "176617": details_page("FGA0099", "OUTRO")}
    )

    with pytest.raises(SigaaParseError, match="FGA0099.*FGA0030"):
        await _collect(sigaa)


async def test_detalhes_sem_campo_de_requisitos_sao_barulhentos():
    broken = {
        "176617": "<html><body><table class='visualizacao'></table></body></html>"
    }
    sigaa = FakePublicSigaa(details=broken)

    with pytest.raises(SigaaParseError, match="Campo `Código:` ausente"):
        await _collect(sigaa)


async def test_sessao_expirada_nos_detalhes_refaz_a_busca_e_segue():
    sigaa = FakePublicSigaa(expired_details=1)

    (subject,) = await _collect(sigaa)

    assert subject.code == "FGA0030"
    # busca, detalhe descartado, busca de novo, detalhe.
    assert [bool(p.get("id")) for p in sigaa.payloads] == [False, True, False, True]
