# `unb-browser` — guia para agentes

O pacote raspa os sites públicos da UnB fora do SIGAA (RU, calendário, editais)
e devolve modelos Pydantic. Quase todos são WordPress: HTML estático e anexos
(PDF) linkados na página — sem sessão, sem login, sem JSF.

## Layout

Flat layout, como o `sigaa-client` (`[tool.uv.build-backend] module-root = ""`).
Cada site é uma pasta com seu resource, seus modelos e seu parser.

```
unb_browser/
  browser.py        # UnbBrowser — dono do httpx.AsyncClient, só monta resources
  config.py         # URLs, timeout, User-Agent — nenhuma URL literal fora daqui
  exceptions.py     # UnbBrowserError e derivadas
  utils/
    http.py         # fetch_page (HTML -> BeautifulSoup) e fetch_file (bytes)
    parsing.py      # clean_text, lookup_key
  restaurant/       # cardápio do RU (ru.unb.br)
    resource.py     # Restaurant.get_menu — acha os PDFs do campus na página
    models.py       # Campus, DailyMenu, MenuSection, MenuSectionKey
    pdf.py          # tabela do PDF -> DailyMenu
tests/
  fixtures/         # PDFs reais e completos do RU (públicos)
```

## Padrões

Herdados do `sigaa-client`:

- **Client só monta resources** e os expõe como atributo (`browser.restaurant`).
  Recebem o `httpx.AsyncClient` no `__init__` e fazem request só pelos helpers
  de `utils/http.py`.
- **Resource** é uma classe por site com métodos `async` públicos e verbos
  explícitos (`get_menu`). O parse fica em funções de módulo privadas.
- **Modelos** Pydantic `frozen`; dado ausente é `None`, nunca string vazia.
- **Erros** derivam de `UnbBrowserError`. Estrutura ausente é `UnbParseError`
  com mensagem dizendo o que faltou — o pacote é barulhento quando o site muda.
- **Constantes** no `config.py` (URLs) ou no topo do módulo; regex compilada em
  `_ALGO_RE`.
- **Novo helper de texto/HTTP** usado por mais de um site vai para `utils/`.

## Criando um novo scraper

1. Crie `unb_browser/<site>/` com `resource.py`, `models.py` e, se precisar,
   um módulo de parse (`pdf.py`, `html.py`).
2. Coloque a URL da página em `config.py`.
3. Exponha no `browser.py` (`self.<site> = <Resource>(self._http)`) e exporte
   modelos/exceções novos em `unb_browser/__init__.py` (`__all__` em ordem
   alfabética).
4. Teste em `tests/test_<site>.py` com `httpx.MockTransport` (abaixo).
5. Documente no README.

## Cardápio do RU

A página `ru.unb.br/cardapio-refeitorio/` tem um `<h3>Cardápio {campus}</h3>`
por campus seguido dos links dos PDFs, um por semana (normalmente uma ou duas).
Campus sem link devolve `()`; campus sem o `<h3>` levanta `UnbParseError`.

Cada PDF tem uma página por refeição, com uma tabela: coluna `COMPOSIÇÃO` com
as categorias e uma coluna por dia. `pdf.py` lê com `pdfplumber` e casa tudo
pela **geometria**, nunca pelo índice da coluna:

- **Colunas variam** entre campi e semanas (subcolunas, células mescladas). Um
  item vai para todo dia cujo centro está dentro da célula — assim "Café OU
  chá", mesclado na semana inteira, aparece em todos os dias.
- **Datas do cabeçalho** usam a tolerância geométrica de 2 pontos: no PDF de
  28/09/2026, o centro das datas fica 0,12 ponto abaixo de `COMPOSIÇÃO`.
- **Categorias mescladas na vertical** (`BEBIDAS` cobre duas linhas) viram uma
  seção com um item por linha.
- **Retângulos brancos** em volta dos ícones de alérgenos seriam lidos como
  bordas e partiriam a célula ("Carne de sol trinchada" / "com cebola roxa").
  `_is_visible` descarta formas pintadas de branco antes de achar a tabela.
- **A refeição** vem do rótulo vertical à esquerda de `COMPOSIÇÃO`, que sai de
  trás pra frente (`ã h n a m a d é f a C`).
- **Dias e refeições variam por campus** (Gama só publica seg–sex, Fazenda não
  tem jantar): refeição ausente é `None` e célula vazia não vira seção.
- **Cada seção ganha uma `key`** (`MenuSectionKey`) pelo nome da categoria, via
  `_SECTION_KEYS` (nomes canônicos, comparados via `lookup_key` sem espaços,
  pré-calculados em `_SECTIONS`).
  Palavras quebradas entre linhas, como `ACOMPANHAMENTO S`, recuperam a chave
  e o nome canônico sem alterar os alimentos. Categoria fora da lista vem com
  `key=None` em vez de erro, para não derrubar o cardápio inteiro; se o RU
  criar uma categoria nova, acrescente-a no enum e no dict.
- **Quebra de linha dentro da célula não separa itens**: o texto é normalizado
  num item só ("Arroz branco e integral Feijão preto").

O parse é CPU-bound (~0,3s por PDF) e roda em `asyncio.to_thread`.

**Ainda não extraído**: alérgenos. Os ícones das células são imagens diferentes
das da legenda (outro tamanho/XObject), então exigiriam comparar imagens.

## Testes

Sem rede: um site de mentira via `httpx.MockTransport`, injetado pelo parâmetro
`transport` do `UnbBrowser`. O fake é uma classe chamável (`FakeRuSite`) que
guarda as URLs pedidas. HTML de fixture é string no topo do arquivo de teste,
recortado da página real. Nomes dos testes em português, descrevendo o
comportamento.

Fixtures de PDF ficam em `tests/fixtures/`. Os PDFs do RU são públicos, então
são os reais, como baixados do site: `cardapio-darcy.pdf` (café, almoço e
jantar de 14/9 a 20/9) e `cardapio-fazenda.pdf` (café e almoço de 14/9 a 18/9,
sem jantar).
