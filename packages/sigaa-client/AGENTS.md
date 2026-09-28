# `sigaa-client` — guia para agentes

Raspa o SIGAA da UnB (HTML + JSF) e devolve modelos Pydantic, desacoplando a
API da complexidade do SIGAA e das requests HTTP.

## Layout

```
sigaa_client/
  client.py         # _BaseClient, SigaaClient, SigaaPublicClient — só monta resources
  config.py         # URLs, paths, timeout, User-Agent — nenhuma URL literal fora daqui
  exceptions.py     # SigaaError e derivados
  models.py         # modelos Pydantic (frozen) devolvidos ao chamador
  utils/
    jsf.py          # ViewState, postback `jsfcljs`, submit de form e menu lateral
    parsing.py      # helpers de leitura de HTML compartilhados
    pdf.py          # texto e QR code dos PDFs que o SIGAA devolve
  private/          # resources que exigem sessão autenticada
    session.py      # login CAS, relogin transparente, request/get/post
    profile.py      # perfil e outros dados gerais
    classrooms.py   # turmas, participantes, frequência, estatísticas e notícias da turma
    restaurant.py   # extrato do RU e carteirinha estudantil
  public/           # resources sem login
    session.py      # aquecimento da sessão anônima
    classrooms.py   # lista pública de turmas
tests/
```

## Padrões

- **Camadas.** `Session`/`PublicSession` é a **única** passagem para a rede. O
  resource recebe a sessão no `__init__` e só chama `self._session.get/post`
  (privado) ou `open/submit` (público), nunca `httpx` ou cookie. O client só
  instancia resources e os expõe como atributo (`client.classrooms`).
- **Resource.** Uma classe por área do SIGAA, métodos `async` públicos com
  verbos explícitos (`list_classrooms`, `get_profile`, `search`). O parse fica
  em funções privadas de módulo (`_parse_*`, `_classroom`), nunca em métodos da
  classe.
- **Modelos.** Pydantic `frozen=True`, opcionais com default `None` — dado que
  a tela não expõe vem `None`, nunca string vazia. Nomes seguem as colunas do
  banco do Followw quando houver equivalente.
- **Erros.** Seja barulhento quando o SIGAA muda: toda exceção diz o que faltou
  e onde.
- **Constantes.** URLs e paths em `config.py`; nomes de campo no topo do
  resource (`FORM_ID`, `UNIT_FIELD`); regex compilada em `_ALGO_RE`. Parsing
  sempre pelas `utils`, nunca inline.
- **Comentários.** Só onde o SIGAA é contraintuitivo (HTML malformado, campo
  gerado, ritual de sessão).

## Criando um novo scraper

1. **Levante o fluxo pelo Playwright** (DevTools): qual request devolve a tela,
   GET ou postback, quais campos vão no corpo. Path em `config.py`.
2. **Escolha a camada**: exige login → `private/`; anônimo → `public/`.
3. **Crie o resource** em módulo próprio:

    ```python
    class Grades:
        def __init__(self, session: Session) -> None:
            self._session = session

        async def list_grades(self, classroom_id: str) -> list[Grade]:
            page = await self._session.get(GRADES_PATH)
            return _parse_grades(BeautifulSoup(page.text, "lxml"))
    ```

4. **Modele o retorno** em `models.py`.
5. **Exponha** no `client.py` (`self.grades = Grades(self._session)`) e exporte
   modelos/exceções novos em `sigaa_client/__init__.py` (`__all__` em ordem
   alfabética).
6. **Teste** com `httpx.MockTransport` (abaixo).
7. **Documente no README** se mudar a superfície pública.

### Postback JSF

Links `<a href="#">` do SIGAA disparam `jsfcljs(...)`. `utils/jsf.py` cobre:

- **Clique em link** (`build_postback`): `link_params(anchor)` lê o `onclick`,
  `read_viewstate(soup)` pega o `ViewState` da resposta **mais recente**, e
  `build_postback(form, params, viewstate)` devolve `(action, payload)`.
- **Submit de form** (`build_submit`): reenvia o form como veio, sobrescrevendo
  só os campos passados. O botão (`j_id_jsp_...`, gerado) é achado pelo rótulo.
- **Menu lateral** (`build_menu_action`): o `jscookMenu` não usa `jsfcljs`; só
  sobrescreve o hidden `jscook_action` com a expressão do bean (ex.:
  `algumForm:algumMenu:A]#{ bean.metodo }`, lida do array JS do menu) e submete
  o form. Sem botão nem parâmetros de link.

Regras:

- **`ViewState` morre a cada postback.** Releia a página antes de cada um;
  nunca guarde entre chamadas.
- **Contexto vive na sessão, não na URL.** Ex.: `ava/participantes.jsf` mostra
  a turma do último "Acessar Turma Virtual". Após trocar de contexto, **confirme
  na resposta** que o SIGAA foi para onde se pediu (`_assert_context` em
  `private/classrooms.py`).
- **Nem toda tela da turma abre por GET.** `participantes.jsf` abre; o mapa de
  frequências (`FrequenciaAluno/mapa.jsf`) dá "Comportamento Inesperado" e só
  vem pelo item **Frequência** do `formMenu` de `ava/index.jsf`.
- **Telas da turma passam por `_read_screen`**: segura o lock do contexto, abre
  a turma, lê a tela e confere o contexto numa operação só. O lock é só do
  client — outro client na mesma sessão (api e job do mesmo usuário) pode
  trocar a turma, então `_ContextSwitched` reabre até `_SCREEN_ATTEMPTS` vezes.
  Telas em dois passos (notícias: menu **Notícias** → **Visualizar**) fazem os
  dois postbacks no mesmo `open_screen`.
- **Sessão anônima precisa de aquecimento.** O JSF só aceita a view se ela
  passou pela home pública; `PublicSession` faz isso na primeira request e em
  `restart()`. Retry = reler o form e reenviar do zero, uma vez só.
- **HTML malformado.** Tags fecham no lugar errado (`</fieldset>` antes da
  tabela); às vezes `find_next` é a única saída.

## Testes

Sem rede: um `FakeSigaa` chamável (`__call__(request) -> Response`) que guarda
o que recebeu (`paths`, `payloads`) e expõe `transport` (`httpx.MockTransport`),
injetado no client:

```python
async with SigaaClient(CREDENTIALS, transport=sigaa.transport) as client:
    turmas = await client.classrooms.list_classrooms()
```

- O fake **simula o ritual** (exige cookie, invalida sessão, descarta submit
  sem home), cobrindo relogin e retry.
- Fixtures de HTML são strings no topo do teste, recortadas da página real e
  reduzidas ao que o parser usa.
- Fixtures de PDF ficam em `tests/fixtures/`, geradas com dados sintéticos —
  nunca um PDF real (carrega CPF, foto e matrícula).

