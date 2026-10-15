import httpx
import pytest
from pydantic import ValidationError

from sigaa_client import (
    CurriculumPeriod,
    SigaaParseError,
    SigaaPublicClient,
    SigaaSearchError,
)
from sigaa_client.config import PUBLIC_CURRICULA_PATH, PUBLIC_HOME_PATH

LIST = """
<form id="formCurriculosCurso" action="/sigaa/public/curso/curriculo.jsf">
<input name="javax.faces.ViewState" value="STATE">
<table id="table_lt">
<tr class="campos"><td colspan="3">Matutino e Vespertino</td></tr>
<tr><td>Detalhes da Estrutura Curricular 8117/1, Criado em 2020</td><td>Ativa</td>
<td><a title="Visualizar Estrutura Curricular"
onclick="jsfcljs(this,{'formCurriculosCurso:detail':'formCurriculosCurso:detail','id':'456'},'')"></a></td></tr>
<tr><td>Detalhes da Estrutura Curricular 8117/-2, Criado em 2018</td><td>Inativa</td>
<td><a title="Visualizar Estrutura Curricular"
onclick="jsfcljs(this,{'formCurriculosCurso:other':'formCurriculosCurso:other','id':'455'},'')"></a></td></tr>
<tr><td colspan="3">2 Estruturas Curriculares Disponíveis</td></tr>
</table></form>
"""
DETAIL = """
<form id="formulario"><table class="formulario">
<tr><th>Código:</th><td>8117/1</td></tr>
<tr><th>Matriz Curricular:</th><td>ADMINISTRAÇÃO - Bacharelado - D</td></tr>
<tr><th>Período Letivo de Entrada em Vigor:</th><td>2020.1</td></tr>
</table>
<div id="optativas"><table><tr class="linhaPar">
<td>ADM0002 - ESTUDOS E PESQUISAS EM ADMINISTRAÇÃO - 30h</td><td>Optativa</td><td></td>
</tr><tr><td colspan="3">Carga Horária Total: 30h</td></tr></table></div>
<div id="complementares"><table><tr><td colspan="3">Carga Horária Total: h</td></tr></table></div>
<div id="semestre1"><table>
<tr><td>ADM0023 - INTRODUÇÃO À ADMINISTRAÇÃO - 60h</td><td>Obrigatória</td><td></td></tr>
<tr><td>ADM0002 - ESTUDOS E PESQUISAS EM ADMINISTRAÇÃO - 30h</td><td>Optativa</td><td></td></tr>
<tr><td>ADM0315 - TÓPICOS CONTEMPORÂNEOS EM ADMINISTRAÇÃO 1 - 30h</td><td>Optativa</td><td></td></tr>
</table></div>
<div id="semestre3"><table><tr><td colspan="3">Carga Horária Total: h</td></tr></table></div>
</form>
"""


class FakeSigaa:
    def __init__(self, *, expire=False, detail=DETAIL, listing=LIST):
        self.expire = expire
        self.detail = detail
        self.listing = listing
        self.homes = 0
        self.views = 0
        self.posts = 0

    def __call__(self, request):
        if request.url.path == PUBLIC_HOME_PATH:
            self.homes += 1
            return httpx.Response(
                200,
                text="home",
                headers={"set-cookie": f"JSESSIONID=session{self.homes}; Path=/"},
            )
        assert self.homes
        assert "JSESSIONID=" in request.headers["cookie"]
        assert request.url.path == PUBLIC_CURRICULA_PATH
        if request.method == "GET":
            assert request.url.params["id"] == "414112"
            self.views += 1
            return httpx.Response(
                200, text=self.listing.replace("STATE", f"state{self.views}")
            )
        self.posts += 1
        payload = dict(httpx.QueryParams(request.content.decode()))
        assert payload == {
            "formCurriculosCurso": "formCurriculosCurso",
            "formCurriculosCurso:detail": "formCurriculosCurso:detail",
            "id": "456",
            "javax.faces.ViewState": f"state{self.views}",
        }
        if self.expire and self.posts == 1:
            return httpx.Response(302, headers={"location": PUBLIC_HOME_PATH})
        return httpx.Response(200, text=self.detail)


async def test_lista_e_detalhes_preservam_vigencia_e_separam_componentes():
    fake = FakeSigaa()
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        summaries = await client.curricula.list_curricula(414112)
        curriculum = await client.curricula.get_curriculum(414112, 456)
        await client.curricula.get_curriculum(414112, 456)
    assert [(item.sigaa_id, item.active) for item in summaries] == [
        (456, True),
        (455, False),
    ]
    assert curriculum.valid_from == "2020.1"
    assert curriculum.shift == "D"
    assert curriculum.required_by_period[0].required == ("ADM0023",)
    assert curriculum.required_by_period[1].period == 3
    assert curriculum.required_by_period[1].required == ()
    assert curriculum.optional == ("ADM0002", "ADM0315")
    assert curriculum.complementary == ()
    assert fake.views == 3
    assert curriculum.model_dump(mode="json")["required_by_period"] == [
        {"period": 1, "required": ["ADM0023"]},
        {"period": 3, "required": []},
    ]


async def test_sessao_expirada_reabre_listagem_e_viewstate():
    fake = FakeSigaa(expire=True)
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        assert (await client.curricula.get_curriculum(414112, 456)).sigaa_id == 456
    assert fake.views == fake.posts == 2
    assert fake.homes == 3


@pytest.mark.parametrize(
    "detail",
    [
        DETAIL.replace("8117/1", "outro"),
        DETAIL.replace("2020.1", ""),
        DETAIL.replace('id="optativas"', 'id="outro"'),
        DETAIL.replace("Obrigatória", "Desconhecida"),
        DETAIL.replace("ADM0023 - INTRODUÇÃO À ADMINISTRAÇÃO - 60h", "linha quebrada"),
    ],
)
async def test_layout_inesperado_nao_vira_dataset_parcial(detail):
    async with SigaaPublicClient(
        transport=httpx.MockTransport(FakeSigaa(detail=detail))
    ) as client:
        with pytest.raises(SigaaParseError):
            await client.curricula.get_curriculum(414112, 456)


@pytest.mark.parametrize("section", ["semestre1", "semestre3"])
async def test_periodo_zero_falha_no_scraper_mesmo_quando_vazio(section):
    fake = FakeSigaa(detail=DETAIL.replace(section, "semestre0"))
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        with pytest.raises(SigaaParseError, match=r"Período zero.*semestre0.*456"):
            await client.curricula.get_curriculum(414112, 456)


@pytest.mark.parametrize("period", [0, -1])
def test_modelo_recusa_periodos_nao_positivos(period):
    with pytest.raises(ValidationError):
        CurriculumPeriod(period=period, required=("ADM0023",))


async def test_curriculo_inexistente_nao_submete_outro():
    fake = FakeSigaa()
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        with pytest.raises(SigaaSearchError, match="não encontrado"):
            await client.curricula.get_curriculum(414112, 999)
    assert fake.posts == 0


async def test_lista_vazia_exige_indicacao_explicita():
    listing = '<form id="formCurriculosCurso"><table id="table_lt"><tr><td>0 Estruturas Curriculares Disponíveis</td></tr></table></form>'
    fake = FakeSigaa(listing=listing)
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        assert await client.curricula.list_curricula(414112) == []
        fake.listing = listing.replace("0 Estruturas Curriculares Disponíveis", "")
        with pytest.raises(SigaaParseError):
            await client.curricula.list_curricula(414112)


async def test_contagem_divergente_nao_omite_curriculos_silenciosamente():
    fake = FakeSigaa(listing=LIST.replace("2 Estruturas", "3 Estruturas"))
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        with pytest.raises(SigaaParseError, match="Contagem"):
            await client.curricula.list_curricula(414112)


@pytest.mark.parametrize(
    ("label", "expected"),
    [
        ("Matutino", "D"),
        ("Vespertino", "D"),
        ("Integral", "D"),
        ("Noturno", "N"),
        ("Matutino e Vespertino", "D"),
        ("Matutino e Noturno", "N"),
        ("Vespertino e Noturno", "N"),
        ("Matutino, Vespertino e Noturno", "N"),
        ("ENGENHARIA DE INTELIGÊNCIA ARTIFICIAL - Matutino e Vespertino", "D"),
        ("CONSERVAÇÃO E USO DA BIODIVERSIDADE - Noturno", "N"),
        ("Turno Indefinido", None),
        ("", None),
    ],
)
async def test_turnos_retornam_letras(label, expected):
    fake = FakeSigaa(listing=LIST.replace("Matutino e Vespertino", label))
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        summaries = await client.curricula.list_curricula(414112)
    assert all(item.shift == expected for item in summaries)


async def test_turno_desconhecido_nao_e_descartado():
    fake = FakeSigaa(listing=LIST.replace("Matutino e Vespertino", "Outro turno"))
    async with SigaaPublicClient(transport=httpx.MockTransport(fake)) as client:
        with pytest.raises(SigaaParseError, match="Turno desconhecido"):
            await client.curricula.list_curricula(414112)
