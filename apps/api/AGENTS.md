# Followw api — guia para agentes

API em FastAPI. Fala com o SIGAA pelo `sigaa_client` e guarda cache em Postgres (SQLAlchemy
assíncrono).

## Layout

```
api/
  core/config.py        # Settings, lido de .env
  db/                   # Base, mixins, enums, modelos e SessionmakerDep
  modules/<feature>/    # router.py, service.py, repository.py da feature (e suas tarefas de sync)
  sync/                 # Sync (SWR), Job, fila do QStash e a rota /jobs com o registro TASKS
  academic_calendar.py  # regras pelo calendário acadêmico (congelar sync, status do aluno)
  sigaa.py              # SigaaConnection da requisição
  cookies.py            # cookies de sessão cifrados
  cache.py              # Cache-Control, age e is_stale
  errors.py             # exceções do SIGAA e do RU → HTTP, num lugar só
tests/                  # unit/ (sem Docker) e integration/<feature>/
```

## Padrões

- **Módulos.** Uma pasta por feature com `router`, registrado em `api/main.py`. Rotas sem login vão
  em `modules/public_<feature>` (prefixo `/public/<feature>`). Tag nova entra em `x-tagGroups`
  (`custom_openapi`), senão some do `/docs`.
- **Sessão.** Sem tabela: token e credenciais vivem em cookies `httponly` cifrados (JWE), renovados
  só quando a requisição vai ao SIGAA. Use `SigaaConnectionDep` (abre o client sob demanda),
  `SigaaClientDep` (rotas sem cache) ou `SigaaPublicClientDep` (sem login).
- **Validação** de parâmetros e corpo é feita **sempre** pelo Pydantic no router (tipos, `Field`,
  `StringConstraints` e, para regras entre campos, um modelo de query com `model_validator`). O
  service recebe valores já normalizados e só valida o que depende de banco, login ou SIGAA.
- **Erros** sobem sem tradução até `errors.py`. Só falta de cookie e `AuthenticationFailed` dão 401
  (o front trata como logout; o segundo apaga os cookies). Not found → 404, `SigaaSearchError` →
  422, o resto (inclusive `SessionExpired`) → 502.
- **Cache.** Dado que vale cache passa por um service com `Sync.resolve(tarefa, alvo, load)`
  (stale-while-revalidate). `load` lê o cache e devolve `Cached` com a validade da feature, a mesma
  do sync do login. A tarefa (`(ctx: Context[alvo]) -> None`) busca no SIGAA e grava; o alvo é a
  conta (`None`), uma turma (`OwnLink`) ou um item dela (`Item`). Tarefa nova entra em `TASKS`. Rota
  com cache ganha o `Cache-Control` pelo service; GET sem cache usa `NoStore`.
- **Jobs.** Nada roda após a resposta: o que venceu vira job no QStash (um por turma e um da conta),
  com a credencial cifrada e sessão própria do SIGAA, com logout no fim. Nunca use a sessão do
  usuário num job. Falha da origem tem uma única retentativa.
- **Repositories** recebem `AsyncSession` e não fazem commit (`Database.write` faz). Nunca persista
  credenciais; grave em lote (turmas têm milhares de participantes).
- **Modelos** herdam `Base, UUIDPrimaryKeyMixin, TimestampMixin`, salvo os de chave natural
  (`subjects`, `units`); enums gravam o `.value`. Sem migrations: `db-init` cria tabelas ausentes e
  semeia os CSVs de `packages/sigaa-client/data/`; alterar colunas exige recriar o banco. O sync
  preserva a unidade semeada e resolve cursos homônimos pelo turno do perfil (diurno se ausente).
- **Settings** é instanciado no import: env de teste vai antes do primeiro import de
  `api.core.config`.

## Testes

Pela interface HTTP. `tests/unit/` tem as regras puras (sem banco nem `TestClient`) e roda sem
Docker; `tests/integration/<feature>/` tem o resto, com fixtures da feature no `conftest.py` e
constantes e funções compartilhadas no `helpers.py` da pasta. Fixtures em
`tests/integration/conftest.py`:

- `client`: Postgres via testcontainers, limpo por teste; entrega os jobs publicados em `POST /jobs`
  antes de responder.
- `api`: a app sem banco (usar o banco falha o teste), para validação e OpenAPI.
- `sigaa` (SIGAA via respx), `stub_sigaa` (`SigaaClient` trocado por `AsyncMock`; cada job abre o
  seu), `qstash` (`qstash.jobs()` decifra o que foi publicado) e `probe_app` (app isolada para
  testar uma dependência).

Casos de validação de um mesmo endpoint vão num teste só, com `subtests`. A tradução dos erros do
SIGAA é testada uma vez em `test_errors.py`; cada rota testa só um caso de propagação.

## Comandos

```fish
uv run pytest apps/api       # testes da api (da raiz do monorepo)
docker compose up -d        # Postgres, Redis e QStash locais (compose.yml da raiz)
uv run db-init               # cria as tabelas
uv run api                   # api em dev (reload on)
```

Requer `apps/api/.env` (veja `.env.example` e `core/config.py`).
