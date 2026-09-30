# Followw api — guia para agentes

API em FastAPI. Fala com o SIGAA pelo `sigaa_client` e guarda cache em Postgres (SQLAlchemy
assíncrono).

## Layout

```
api/
  core/config.py      # Settings, lido de .env
  db/                 # Base, mixins, enums e modelos
  dependencies/       # sessão do SIGAA, Cache-Control, fila de jobs e SyncEngine
  repositories/       # acesso ao banco
  services/           # regras de negócio; sync.py tem SyncEngine, Task, Job e TTLs
  modules/<feature>/  # routers
  utils/session.py    # cookies de sessão cifrados
tests/
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
- **Erros do SIGAA** viram `HTTPException` nas dependências e nunca vazam da rota:
  `AuthenticationFailed` → 401 e apaga os cookies; `SessionExpired` → 401; resto → 502.
- **Services e cache.** Rota não fala com repository nem com o SIGAA: chama um service, que resolve
  o dado com `SyncEngine.resolve` (stale-while-revalidate). Services leem o cache em sessão própria,
  nunca pelo `get_db` da requisição. Todo dado do SIGAA que vale cache segue esse caminho.
- **Cache-Control.** Toda rota GET declara a política: com cache recebe `CacheControlDep` e repassa
  ao service; sem cache usa `dependencies=[NoStore]`. O cliente pode pedir `no-cache`, `max-age`,
  `stale-if-error` e `only-if-cached` (veja `dependencies/cache.py`).
- **Jobs.** Nada roda depois da resposta, a revalidação em segundo plano vira um `Job` publicado no
  QStash, que o entrega em `POST /jobs`. O job leva só o token cifrado, nunca a senha.
- **Repositories** recebem `AsyncSession` e não fazem commit (o `SyncEngine` faz). Nunca persista
  credenciais. Turmas podem ter milhares de participantes: grave em lote.
- **Modelos.** Toda tabela herda `Base, UUIDPrimaryKeyMixin, TimestampMixin`; enums do banco são
  `str, enum.Enum` com `values_callable` para gravar o `.value`. Não há migrations: `db-init` só
  cria o que falta, alterar tabela exige recriar o banco.
- **Settings** é instanciado no import: env de teste precisa ser setada antes do primeiro import de
  `api.core.config` (veja `tests/conftest.py`).

## Testes

Fixtures em `tests/conftest.py`: `client` (SQLite por teste, entrega os jobs publicados em
`POST /jobs` antes de responder), `sigaa` (SIGAA via respx), `stub_sigaa` (`SigaaClient` trocado por
`AsyncMock`) e `qstash` (intercepta a API do QStash).

## Comandos

```fish
uv run pytest apps/api       # testes da api (da raiz do monorepo)
docker compose up -d db      # Postgres local (compose.yml da raiz)
bunx @upstash/qstash-cli dev # QStash local
uv run db-init               # cria as tabelas
uv run api                   # api em dev (reload on)
```

Requer `apps/api/.env` (veja `.env.example` e `core/config.py`).
