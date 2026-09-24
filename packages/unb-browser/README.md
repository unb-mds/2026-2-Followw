# `unb-browser`

Biblioteca Python assíncrona que lê os sites públicos da UnB fora do SIGAA e
devolve modelos Pydantic. Hoje cobre o cardápio do RU; calendário acadêmico e
editais entram como novos módulos.

> Trabalhando **dentro** do pacote (novos scrapers, padrões, testes)? Veja
> [AGENTS.md](AGENTS.md).

## Instalação

Dentro do monorepo, o pacote é um membro do workspace `uv`:

```toml
# pyproject.toml do app que consome
dependencies = ["unb-browser"]

[tool.uv.sources]
unb-browser = { workspace = true }
```

O módulo importável é `unb_browser`. Requer Python >= 3.14.

## Get started

Tudo é `async` e o browser é um context manager — ele é dono de uma conexão
HTTP, então use `async with` (ou chame `aclose()` no fim).

```python
import asyncio

from unb_browser import Campus, UnbBrowser


async def main():
    async with UnbBrowser() as browser:
        menu = await browser.restaurant.get_menu(Campus.DARCY_RIBEIRO)
        print([day.model_dump(mode="json") for day in menu])


asyncio.run(main())
```

## Cardápio do RU

```python
await browser.restaurant.get_menu(Campus.GAMA)  # tuple[DailyMenu, ...]
await browser.restaurant.get_menu("Ceilândia")  # o nome do campus também vale
```

`Campus`: `DARCY_RIBEIRO`, `CEILANDIA`, `GAMA`, `PLANALTINA` e
`FAZENDA_AGUA_LIMPA`. Um nome fora dessa lista levanta `ValueError`.

Devolve todos os dias de todas as semanas publicadas para o campus (normalmente
uma ou duas), em ordem de data. Cada `DailyMenu` traz `breakfast`, `lunch` e
`dinner` como uma lista de seções na ordem da tabela do PDF:

```json
{
  "date": "2026-09-21",
  "breakfast": [
    {"key": "drink", "name": "Bebidas", "items": ["Leite integral OU Bebida de soja", "Café OU chá"]},
    {"key": "bread", "name": "Panificação", "items": ["Pão francês ou Pão careca ou Pão integral"]}
  ],
  "lunch": [
    {"key": "salad_1", "name": "Salada 1", "items": ["Repolho roxo"]},
    {"key": "main_dish", "name": "Prato principal padrão", "items": ["Frango com manteiga de ervas"]}
  ],
  "dinner": null
}
```

- `name` é o texto do PDF e `key` é uma chave estável para o código usar
  (`MenuSectionKey`):

  | `key`                   | Seção no PDF                          | Refeições      |
  | ----------------------- | ------------------------------------- | -------------- |
  | `drink`                 | Bebidas / Bebida (refresco de)        | todas          |
  | `bread`                 | Panificação                           | café           |
  | `extra`                 | Opção extra                           | café           |
  | `spread`                | Gordura                               | café           |
  | `complement`            | Complemento padrão                    | café           |
  | `complement_vegetarian` | Complemento ovolactovegetariano       | café           |
  | `complement_vegan`      | Complemento vegetariano estrito       | café           |
  | `fruit`                 | Fruta                                 | café           |
  | `salad_1`               | Salada 1                              | almoço, jantar |
  | `salad_2`               | Salada 2                              | almoço, jantar |
  | `salad_dressing`        | Molho para salada                     | almoço, jantar |
  | `main_dish`             | Prato principal padrão                | almoço, jantar |
  | `main_dish_vegetarian`  | Prato principal ovolactovegetariano   | almoço, jantar |
  | `main_dish_vegan`       | Prato principal vegetariano estrito   | almoço, jantar |
  | `side_dish`             | Guarnição                             | almoço         |
  | `accompaniments`        | Acompanhamentos                       | almoço, jantar |
  | `soup`                  | Sopa                                  | jantar         |
  | `toast`                 | Torrada                               | jantar         |
  | `dessert`               | Sobremesa                             | almoço, jantar |

- Se o RU criar ou renomear uma categoria, a seção continua vindo com o `name`
  do PDF, mas com `key` `null`.
- Refeição que o campus não serve no dia vem `null` (a Fazenda Água Limpa não
  tem jantar; alguns campi não servem café no sábado).
- Campus sem semana publicada devolve `()`.
- Custa um GET da página + um GET por PDF (em paralelo). Não há cache aqui.

Alérgenos ainda não são extraídos.

## Erros

| Exceção           | Significa                                                     |
| ----------------- | ------------------------------------------------------------- |
| `UnbBrowserError` | base de todos os erros do pacote                              |
| `UnbParseError`   | a página ou o PDF mudou de layout — não tem o que se esperava |

Erros HTTP sobem como `httpx.HTTPStatusError`.
