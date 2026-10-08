# Followw api — guia para agentes

API em FastAPI. Fala com o SIGAA pelo `sigaa_client` e guarda cache em Postgres (SQLAlchemy
assíncrono).

## Layout

```
api/
  core/config.py      # Settings, lido de .env
  db/                 # Base, mixins, enums, modelos e SessionmakerDep
  modules/<feature>/  # router.py, service.py, repository.py da feature (e suas tarefas de sync)
  sync/               # Sync (SWR), Job, fila do QStash e a rota /jobs com o registro TASKS
  academic_calendar.py # regras pelo calendário acadêmico (congelar sync, status do aluno)
  sigaa.py            # SigaaConnection da requisição
  cookies.py          # cookies de sessão cifrados
  cache.py            # Cache-Control, age e is_stale
  errors.py           # exceções do SIGAA e do RU → HTTP, num lugar só
tests/                # um arquivo por módulo
```

## Padrões

- **Módulos.** Uma pasta por feature com `router = APIRouter()`, registrado em `api/main.py`. Rotas
  sem login ficam em `modules/public_<feature>` (prefixo `/public/<feature>`, tag
  `Public <Feature>`). Toda tag nova entra em `x-tagGroups` (`custom_openapi`), senão some do
  `/docs`.
- **Sessão.** Não há tabela de sessão: token e credenciais vivem em cookies `httponly` cifrados
  (JWE). Use `SigaaConnectionDep` (só abre o client se precisar ir ao SIGAA), `SigaaClientDep`
  (rotas sem cache) ou `SigaaPublicClientDep` (sem login). Os cookies só renovam quando a requisição
  usa o SIGAA; resposta do cache não renova.
- **Erros** do `sigaa_client` e do `unb_browser` sobem até os handlers de `errors.py`; dependências
  e services não traduzem: `AuthenticationFailed` → 401 e apaga os cookies; `SessionExpired` → 401;
  `ClassroomNotFound`/`NewsNotFound` → 404; `SigaaSearchError` → 422; resto → 502.
- **Services e cache.** Rota não fala com o SIGAA para dado que vale cache: chama um service, que
  resolve com `Sync.resolve(tarefa, alvo, load)` (stale-while-revalidate). `load` lê o cache em
  sessão própria do banco e devolve `Cached` (ou `None`) com o `Freshness` calculado pela função de
  validade da feature, a mesma que o sync do login usa. A tarefa é uma função da feature
  `(ctx: Context[alvo]) -> None` que busca no SIGAA e grava; o alvo é a conta (`None`), uma turma do
  usuário (`OwnLink`) ou um item dela (`Item`). Toda tarefa nova entra em `TASKS`
  (`sync/router.py`).
- **Cache-Control.** O `SyncDep` já recebe o `CacheControlDep`: toda rota com cache o ganha pelo
  service. Rota GET sem cache usa `dependencies=[NoStore]`. O cliente pode pedir `no-cache`,
  `max-age`, `stale-if-error` e `only-if-cached` (veja `cache.py`).
- **Jobs.** Nada roda depois da resposta: o `Sync` junta o que venceu e publica no QStash, antes de
  responder, um job por turma (e um da conta). O job leva a credencial cifrada, loga numa sessão
  própria do SIGAA e faz logout no fim; nunca use a sessão do usuário num job. Tarefa que falha na
  origem tem uma única retentativa.
- **Repositories** recebem `AsyncSession` e não fazem commit (o `Database.write` faz, com
  retentativa). Nunca persista credenciais. Turmas podem ter milhares de participantes: grave em
  lote.
- **Modelos.** Toda tabela herda `Base, UUIDPrimaryKeyMixin, TimestampMixin`, salvo as de chave
  natural (como `subjects`, pelo código); enums do banco são `str, enum.Enum` com `values_callable`
  para gravar o `.value`. Não há migrations: `db-init` só cria o que falta, alterar tabela exige
  recriar o banco.
- **Settings** é instanciado no import: env de teste precisa ser setada antes do primeiro import de
  `api.core.config` (veja `tests/conftest.py`).

## Testes

Pela interface HTTP. Fixtures em `tests/conftest.py`: `client` (SQLite por teste, entrega os jobs
publicados em `POST /jobs` antes de responder), `sigaa` (SIGAA via respx), `stub_sigaa`
(`SigaaClient` trocado por `AsyncMock`; cada job abre o seu) e `qstash` (intercepta a API do QStash;
`qstash.jobs()` decifra o que foi publicado).

## Comandos

```fish
uv run pytest apps/api       # testes da api (da raiz do monorepo)
docker compose up -d db      # Postgres local (compose.yml da raiz)
bunx @upstash/qstash-cli dev # QStash local
uv run db-init               # cria as tabelas
uv run api                   # api em dev (reload on)
```

Requer `apps/api/.env` (veja `.env.example` e `core/config.py`).
