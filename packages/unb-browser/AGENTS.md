# `unb-browser` — guia para agentes

Raspa os sites públicos da UnB fora do SIGAA (RU, calendário, editais) e devolve modelos Pydantic.
Quase todos são WordPress: HTML estático e PDFs anexos, sem sessão nem JSF.

## Layout

```
unb_browser/
  browser.py        # UnbBrowser, dono do httpx.AsyncClient, só monta resources
  config.py         # URLs, timeout, User-Agent
  exceptions.py
  utils/            # helpers de HTTP e texto compartilhados entre sites
  <site>/           # resource.py, models.py e, se precisar, o parser (pdf.py, html.py)
tests/
  fixtures/
```

## Padrões

Os mesmos do `sigaa-client`:

- `UnbBrowser` só monta resources e os expõe como atributo (`browser.restaurant`); requests só pelos
  helpers de `utils/http.py`.
- Uma classe de resource por site, métodos `async` com verbos explícitos; parse em funções privadas
  de módulo.
- Modelos `frozen`; dado ausente é `None`, nunca string vazia.
- Estrutura ausente levanta `UnbParseError` dizendo o que faltou: o pacote é barulhento quando o site
  muda.
- Nenhuma URL literal fora de `config.py`; regex compilada em `_ALGO_RE`.
- Novo site é exposto no `browser.py`, exportado em `__init__.py` (`__all__` em ordem alfabética) e
  documentado no README.

## Testes

Sem rede: um site falso chamável injetado via `transport` (`httpx.MockTransport`). HTML de fixture é
string no topo do teste, recortado da página real. Nomes dos testes em português, descrevendo o
comportamento. Os PDFs do RU são públicos, então as fixtures são os arquivos reais.
