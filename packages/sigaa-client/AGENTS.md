# `sigaa-client` — guia para agentes

O pacote raspa o SIGAA da UnB (HTML + JSF) e devolve modelos Pydantic. Este
client tem o intuito de desacoplar a API da complexidade do SIGAA e de requests HTTP.

## Layout

O pacote usa flat layout: o módulo importável `sigaa_client` fica na raiz, sem
`src/` no meio (`[tool.uv.build-backend] module-root = ""`).

```
sigaa_client/
  client.py       # _BaseClient, SigaaClient, SigaaPublicClient — só monta resources
  config.py       # URLs, paths, timeout, User-Agent — nenhuma URL literal fora daqui
  exceptions.py   # SigaaError e derivadas
  models.py       # modelos Pydantic (frozen) devolvidos ao chamador
  utils/
    jsf.py        # ViewState, postback `jsfcljs`, submit de form e menu lateral
    parsing.py    # helpers de leitura de HTML compartilhados
    pdf.py        # texto e QR code dos PDFs que o SIGAA devolve
  private/        # resources que exigem sessão autenticada
    session.py    # login CAS, relogin transparente, request/get/post
    profile.py
    classrooms.py  # turmas, participantes, frequência e estatísticas da turma
    restaurant.py # extrato do RU e carteirinha estudantil
  public/         # resources sem login
    session.py    # aquecimento da sessão anônima
    classrooms.py
tests/
```

## Padrões

**Camadas.** `Session` (ou `PublicSession`) é a **única** passagem para a rede.
Um resource nunca toca em `httpx` nem em cookie: recebe a sessão no `__init__` e
chama `self._session.get/post` (privado) ou `self._session.open/submit`
(público). O client só instancia resources e os expõe como atributo
(`client.classrooms`).

**Resource.** Uma classe por área do SIGAA, com métodos `async` públicos e
verbos explícitos (`list_classrooms`, `get_profile`, `search`). Toda a lógica de
parse fica em funções de módulo privadas (`_parse_*`, `_classroom`, `_member`) —
sem método privado de parse na classe. Facilita testar e ler.

**Modelos.** Pydantic, `ConfigDict(frozen=True)`, campos opcionais com default
`None`. Os nomes seguem as colunas do banco do Followw quando houver
equivalente. Um dado que o SIGAA não expõe naquela tela vem `None` — nunca
string vazia.

**Erros.** Tudo deriva de `SigaaError`:

| Exceção                | Quando                                             |
| ---------------------- | -------------------------------------------------- |
| `AuthenticationFailed` | CAS rejeitou a credencial                          |
| `SessionExpired`       | sessão morreu e não há como reautenticar           |
| `SigaaParseError`      | o HTML não tem a estrutura esperada (layout mudou) |
| `SigaaSearchError`     | o SIGAA recusou os filtros e disse o porquê        |

Estrutura ausente é `SigaaParseError`, não `None` silencioso: o pacote é
desenhado para ser barulhento quando o SIGAA muda. Toda mensagem diz o que
faltou e onde.

**Constantes.** URLs, paths e nomes de campo do SIGAA ficam em `config.py` ou em
constantes de módulo no topo do resource (`FORM_ID`, `UNIT_FIELD`,
`CLASSROOM_ID_FIELD`). Regex sempre compilada em constante `_ALGO_RE`.

**Texto.** Não escreva parse de texto na mão: `clean_text` (normaliza espaços),
`visible_text` (remove os balões `.popUp` que o SIGAA embute nas células),
`split_course`, `split_location`, `schedule_code`, `lookup_key` (minúscula e
sem acento, para bater com as chaves de um dict). Se precisar de outro, ele vai
para `utils/parsing.py`.

**Comentários.** Só onde o SIGAA faz algo contraintuitivo (HTML malformado,
campo gerado, ritual de sessão). Comportamento óbvio não se comenta.

## Criando um novo scraper

1. **Levante o fluxo no navegador** com o DevTools aberto: que request devolve a
   tela, se é GET ou postback, quais campos vão no corpo. Anote o path em
   `config.py`.
2. **Escolha a camada**: exige login → `private/`; anônimo → `public/`.
3. **Crie o resource** em um módulo próprio:

    ```python
    class Grades:
        def __init__(self, session: Session) -> None:
            self._session = session

        async def list_grades(self, classroom_id: str) -> list[Grade]:
            page = await self._session.get(GRADES_PATH)
            return _parse_grades(BeautifulSoup(page.text, "lxml"))
    ```

4. **Modele o retorno** em `models.py` (frozen, opcionais com `None`).
5. **Exponha** no `client.py` (`self.grades = Grades(self._session)`) e exporte
   modelos/exceções novos em `sigaa_client/__init__.py` (`__all__` em ordem alfabética).
6. **Teste** com `httpx.MockTransport` (abaixo).
7. **Documente** no README se muda a superfície pública.

### Se a tela exigir postback JSF

O SIGAA usa JSF: links que parecem `<a href="#">` na verdade disparam
`jsfcljs(...)` com um payload. `utils/jsf.py` cobre os três casos:

- **Clique em link** (`build_postback`): `link_params(anchor)` lê os pares do
  `onclick`, `read_viewstate(soup)` pega o `ViewState` da resposta **mais
  recente** e `build_postback(form, params, viewstate)` devolve `(action,
payload)`.
- **Submit de form** (`build_submit`): envia o form inteiro a partir do estado
  que a página trouxe, sobrescrevendo só os campos que você passa. O `name` do
  botão é gerado pelo JSF (`j_id_jsp_...`), então é achado pelo rótulo visível.
- **Item do menu lateral** (`build_menu_action`): o menu (`jscookMenu`) não usa
  `jsfcljs` — cada item só sobrescreve o hidden `jscook_action` do form com a
  expressão do managed bean (ex.: `algumForm:algumMenu:A]#{ bean.metodo }`,
  lida direto do array JS que desenha o menu) e submete o resto do form como
  veio. Sem botão, sem parâmetros de link.

Regras que não dá para burlar:

- **O `ViewState` morre a cada postback.** Releia a página antes de cada
  postback; nunca guarde `ViewState` entre chamadas.
- **Contexto vive na sessão, não na URL.** Em `ava/participantes.jsf`, por
  exemplo, a turma é a que foi aberta pelo último postback de "Acessar Turma
  Virtual". Depois de trocar de contexto, **confirme na resposta** que o SIGAA
  foi para onde se pediu (veja `_assert_context` em `private/classrooms.py`).
- **Nem toda tela da turma abre por GET.** `participantes.jsf` abre; o mapa de
  frequências (`FrequenciaAluno/mapa.jsf`) devolve "Comportamento Inesperado" e
  só aparece pelo postback do item **Frequência** do `formMenu` de
  `ava/index.jsf`. Telas da turma passam por `_read_screen`, que segura o lock
  do contexto, abre a turma, lê a tela e confere o contexto — uma operação só.
- **A sessão anônima precisa de aquecimento.** O JSF só aceita a view de volta
  se ela passou pela home pública; `PublicSession` faz isso na primeira request
  e refaz em `restart()`. Como o `ViewState` morre junto, retry significa reler
  o form e reenviar do zero — uma vez só.
- **O HTML do SIGAA é malformado.** Tags fecham no lugar errado (`</fieldset>`
  antes da tabela), então às vezes `find_next` é a única saída em vez de
  navegar pela árvore.

### Se a tela devolver PDF

Alguns postbacks (ex.: emissão de documentos) não devolvem HTML: a resposta já
é o PDF (`content-type: application/pdf`). `utils/pdf.py` lê esse conteúdo:
`extract_text` para o texto e `find_qr_code` para o QR code embutido (tenta
decodificar cada imagem da página até achar um `BarcodeFormat.QRCode` — não dá
para contar com a ordem/nome das imagens extraídas).

## Testes

Sem rede: um SIGAA de mentira via `httpx.MockTransport`, injetado pelo parâmetro
`transport` do client. O padrão é uma classe `FakeSigaa` que é chamável
(`__call__(request) -> Response`), guarda o que recebeu (`paths`, `payloads`) e
expõe `transport` como property.

```python
async with SigaaClient(CREDENTIALS, transport=sigaa.transport) as client:
    turmas = await client.classrooms.list_classrooms()
```

O fake deve **simular o ritual**, não só devolver HTML: exigir o cookie, invalidar
sessão, descartar submit que não passou pela home. É assim que relogin e retry
ficam cobertos. Os fixtures de HTML são strings no topo do arquivo de teste,
recortadas da página real e reduzidas ao que o parser usa. Nomes dos testes em
português, descrevendo o comportamento (`test_unidade_pode_vir_pelo_nome`).

Fixtures de PDF vão em `tests/fixtures/` (binário, não string) — geradas com
dados sintéticos, nunca um documento real exportado de uma conta de verdade
(o PDF carrega CPF, foto e matrícula de quem gerou).
