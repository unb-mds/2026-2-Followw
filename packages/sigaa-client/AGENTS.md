# `sigaa-client` — guia para agentes

Raspa o SIGAA da UnB (HTML + JSF) e devolve modelos Pydantic, isolando a API da complexidade do
SIGAA.

## Layout

```
sigaa_client/
  client.py         # SigaaClient e SigaaPublicClient, só montam resources
  config.py         # URLs, paths, timeout, User-Agent
  exceptions.py
  models.py         # modelos devolvidos ao chamador
  utils/            # JSF (ViewState, postbacks), parsing de HTML e PDF
  private/          # resources que exigem login
  public/           # resources anônimos
tests/
```

## Padrões

- **Camadas.** `Session`/`PublicSession` é a única passagem para a rede; o resource recebe a sessão
  no `__init__` e nunca usa `httpx` ou cookie direto. O client só instancia resources e os expõe
  como atributo (`client.classrooms`).
- **Resource.** Uma classe por área do SIGAA, métodos `async` com verbos explícitos
  (`list_classrooms`, `get_profile`). O parse fica em funções privadas de módulo (`_parse_*`).
- **Modelos** Pydantic `frozen=True`; dado ausente é `None`, nunca string vazia.
- **Erros.** Seja barulhento quando o SIGAA muda: toda exceção diz o que faltou e onde.
- **Constantes.** Nenhuma URL literal fora de `config.py`; nomes de campo no topo do resource; regex
  compilada em `_ALGO_RE`.
- Novo resource é exposto no `client.py` e seus modelos/exceções exportados em `__init__.py`
  (`__all__` em ordem alfabética). Mudou a superfície pública, atualize o README.

## Particularidades do SIGAA

- Levante o fluxo de uma tela nova pelo Playwright antes de escrever o scraper: qual request devolve
  a tela, GET ou postback, e quais campos vão no corpo.
- **`ViewState` morre a cada postback.** Releia a página antes de cada um.
- **O contexto vive na sessão, não na URL.** Telas da turma mostram a última turma aberta, e outro
  client na mesma sessão pode trocá-la; por isso passam por `_read_screen`, que confere o contexto e
  reabre se preciso. Nem toda tela abre por GET: algumas só vêm pelo menu da turma.
- **Sessão anônima precisa passar pela home pública** antes de o JSF aceitar a view (`PublicSession`
  cuida disso).
- **HTML malformado** é comum: tags fecham no lugar errado, às vezes `find_next` é a única saída.

## Testes

Sem rede: um `FakeSigaa` chamável injetado via `transport` (`httpx.MockTransport`), que simula o
ritual de sessão para cobrir relogin e retry. Fixtures de HTML são strings no topo do teste,
recortadas da página real. Fixtures de PDF ficam em `tests/fixtures/`, com dados sintéticos.
