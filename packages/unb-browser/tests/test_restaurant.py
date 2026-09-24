from datetime import date
from pathlib import Path

import httpx
import pytest

from unb_browser import Campus, MenuSection, UnbBrowser, UnbParseError
from unb_browser.config import RU_MENU_URL
from unb_browser.restaurant.pdf import parse_menu

FIXTURES = Path(__file__).parent / "fixtures"

# Café, almoço e jantar de 14/9 a 20/9, com os ícones de alérgenos dentro de
# retângulos brancos que partem as células.
DARCY_PDF = (FIXTURES / "cardapio-darcy.pdf").read_bytes()
# Café e almoço de 14/9 a 18/9, sem jantar.
FAZENDA_PDF = (FIXTURES / "cardapio-fazenda.pdf").read_bytes()

PDFS = {
    "/wp-content/uploads/2026/09/Darcy-Ribeiro-Semana-04-14-9-a-20-9.pdf": DARCY_PDF,
    "/wp-content/uploads/2026/09/Fazenda-Semana-04-14-9-a-20-9.pdf": FAZENDA_PDF,
}

PAGINA_RU = """
<html><body><main>
<h3 class="elementor-heading-title">Cardápio Darcy Ribeiro</h3>
<p><a href="http://ru.unb.br/wp-content/uploads/2026/09/Darcy-Ribeiro-Semana-04-14-9-a-20-9.pdf">ISM &#8211; 14/9/2026 A 20/9/2026</a></p>
<h3 class="elementor-heading-title">Cardápio Gama</h3>
<p></p>
<h3 class="elementor-heading-title">Cardápio Fazenda Água Limpa</h3>
<p><a href="/wp-content/uploads/2026/09/Darcy-Ribeiro-Semana-04-14-9-a-20-9.pdf">ISM &#8211; 14/9/2026 A 20/9/2026</a></p>
<p><a href="http://ru.unb.br/wp-content/uploads/2026/09/Fazenda-Semana-04-14-9-a-20-9.pdf">ISM &#8211; 14/9/2026 A 18/9/2026</a></p>
<h3 class="elementor-heading-title">Horário de funcionamento</h3>
<p><a href="https://unb.br/images/Documentos/Estatuto.pdf">Estatuto</a></p>
</main></body></html>
"""


class FakeRuSite:
    def __init__(self, page: str = PAGINA_RU) -> None:
        self.page = page
        self.urls: list[str] = []

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.urls.append(str(request.url))
        if str(request.url) == RU_MENU_URL:
            return httpx.Response(200, text=self.page)
        if request.url.path in PDFS:
            return httpx.Response(
                200,
                content=PDFS[request.url.path],
                headers={"content-type": "application/pdf"},
            )
        return httpx.Response(404)


async def test_get_menu_junta_as_semanas_e_a_ultima_publicada_vence():
    site = FakeRuSite()
    async with UnbBrowser(transport=site.transport) as browser:
        menu = await browser.restaurant.get_menu(Campus.FAZENDA_AGUA_LIMPA)

    assert [m.date.day for m in menu] == [14, 15, 16, 17, 18, 19, 20]
    # 14/9 a 18/9 vêm do PDF da Fazenda (sem jantar); 19/9 e 20/9, só do Darcy.
    assert [m.dinner is None for m in menu] == [True] * 5 + [False] * 2
    assert len(site.urls) == 3
    assert not any("Estatuto" in url for url in site.urls)


async def test_get_menu_aceita_o_nome_do_campus():
    site = FakeRuSite()
    async with UnbBrowser(transport=site.transport) as browser:
        menu = await browser.restaurant.get_menu("Darcy Ribeiro")

    assert menu[0].date == date(2026, 9, 14)
    assert len(site.urls) == 2


async def test_get_menu_devolve_json():
    async with UnbBrowser(transport=FakeRuSite().transport) as browser:
        menu = await browser.restaurant.get_menu(Campus.DARCY_RIBEIRO)

    data = menu[0].model_dump(mode="json")
    assert data["date"] == "2026-09-14"
    assert data["breakfast"][0] == {
        "name": "Bebidas",
        "items": ["Leite integral OU Bebida de soja", "Café OU chá"],
    }
    assert data["lunch"][0] == {"name": "Salada 1", "items": ["Alface roxa"]}
    assert data["dinner"][0] == {
        "name": "Salada 1",
        "items": ["Alface lisa com agrião"],
    }


async def test_get_menu_campus_sem_semanas_publicadas_devolve_vazio():
    site = FakeRuSite()
    async with UnbBrowser(transport=site.transport) as browser:
        menu = await browser.restaurant.get_menu(Campus.GAMA)

    assert menu == ()
    assert site.urls == [RU_MENU_URL]


async def test_get_menu_campus_fora_da_pagina_e_barulhento():
    async with UnbBrowser(transport=FakeRuSite().transport) as browser:
        with pytest.raises(UnbParseError, match="Cardápio Planaltina"):
            await browser.restaurant.get_menu(Campus.PLANALTINA)


async def test_get_menu_campus_desconhecido_levanta_value_error():
    async with UnbBrowser(transport=FakeRuSite().transport) as browser:
        with pytest.raises(ValueError):
            await browser.restaurant.get_menu("Asa Norte")


def test_celula_partida_pelos_icones_vira_um_item_so():
    menu = parse_menu(DARCY_PDF)

    assert menu[0].lunch[3] == MenuSection(
        name="Prato principal padrão",
        items=("Carne de sol trinchada com cebola roxa",),
    )


def test_cada_pagina_vira_uma_refeicao_com_as_secoes_na_ordem_da_tabela():
    menu = parse_menu(DARCY_PDF)

    assert [m.date.day for m in menu] == [14, 15, 16, 17, 18, 19, 20]
    assert [s.name for s in menu[0].breakfast] == [
        "Bebidas",
        "Panificação",
        "Opção extra",
        "Gordura",
        "Complemento padrão",
        "Complemento ovolactovegetariano",
        "Complemento vegetariano estrito",
        "Fruta",
    ]
    assert [s.name for s in menu[0].lunch] == [
        "Salada 1",
        "Salada 2",
        "Molho para salada",
        "Prato principal padrão",
        "Prato principal ovolactovegetariano",
        "Prato principal vegetariano estrito",
        "Guarnição",
        "Acompanhamentos",
        "Sobremesa",
        "Bebida (refresco de)",
    ]
    assert [s.name for s in menu[0].dinner] == [
        "Salada 1",
        "Salada 2",
        "Molho para salada",
        "Prato principal padrão",
        "Prato principal ovolactovegetariano",
        "Prato principal vegetariano estrito",
        "Sopa",
        "Torrada",
        "Acompanhamentos",
        "Sobremesa",
        "Bebida (refresco de)",
    ]


def test_celula_mesclada_vale_para_todos_os_dias_e_cada_linha_e_um_item():
    menu = parse_menu(DARCY_PDF)

    assert {m.breakfast[0] for m in menu} == {
        MenuSection(
            name="Bebidas",
            items=("Leite integral OU Bebida de soja", "Café OU chá"),
        )
    }


def test_celula_vazia_nao_vira_secao():
    menu = parse_menu(DARCY_PDF)

    assert menu[0].breakfast[2].items == ("Mingau de aveia",)
    assert "Opção extra" not in [s.name for s in menu[1].breakfast]


def test_refeicao_que_o_campus_nao_serve_vem_none():
    menu = parse_menu(FAZENDA_PDF)

    assert [m.date.day for m in menu] == [14, 15, 16, 17, 18]
    assert all(m.dinner is None for m in menu)
    assert all(m.breakfast and m.lunch for m in menu)
    assert menu[-1].lunch[3].items == ("Peixe ao molho branco gratinado",)


def test_pdf_invalido_e_barulhento():
    with pytest.raises(UnbParseError):
        parse_menu(b"<html>nao e pdf</html>")
