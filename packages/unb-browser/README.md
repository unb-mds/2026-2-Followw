# `unb-browser`

O UnB browser é uma biblioteca python que lê os sites públicos da UnB fora do SIGAA e
devolve modelos Pydantic. Hoje estão cobertos o cardápio do RU e o calendário acadêmico.

## Exemplo de uso

```python
from unb_browser import Campus, UnbBrowser

async with UnbBrowser() as browser:
    menu = await browser.restaurant.get_menu(Campus.DARCY_RIBEIRO)  # tuple[DailyMenu, ...]
    semester = browser.calendar.get_semester("2026.1")
```

- **Cardápio:** traz todos os dias publicados do campus. Cada dia tem
  `breakfast`, `lunch` e `dinner`, com as seções do PDF; refeição que não é
  servida vem `null`.
- **Calendário:** os dados oficiais de 2026 e 2027 ficam em um JSON estático,
  sem requisição de rede.

Os erros derivam de `UnbBrowserError`.
