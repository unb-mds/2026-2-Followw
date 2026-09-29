# Followw api — guia para agentes

API pública do Followw UnB, em FastAPI. Fala com o SIGAA através do
sigaa_client e guarda dados próprios em Postgres via SQLAlchemy assíncrono.

## Layout

```
api/
  core/config.py        # Settings (pydantic-settings), lido de .env
  db/
    base.py             # Base, UUIDPrimaryKeyMixin, TimestampMixin
    enums.py            # enums do banco (str Enum)
    models.py           # modelos SQLAlchemy
    main.py             # engine, async_session, get_sessionmaker, get_db, db-init
  dependencies/
    sigaa.py            # SigaaConnectionDep (preguiçosa) e SigaaClientDep
    sigaa_public.py     # SigaaPublicClientDep
    unb_browser.py      # UnbBrowserDep, aberto só quando a rota precisa do site
    refresh.py          # RefreshQuery (`?refresh=true` ignora o cache)
    qstash.py           # QStashQueue (JobQueueDep) e o job recebido (JobDep)
    sync.py             # SyncEngineDep e JobEngineDep
  repositories/         # user, classroom, restaurant (cache do cardápio)
  services/
    sync.py             # SyncEngine, Task, Job, JobQueue e TTLs
    profile.py          # ProfileService (GET /me)
    classroom.py        # ClassroomService (turmas, participantes, estatísticas, frequência)
    news.py             # NewsService
    restaurant.py       # RestaurantService (cardápio) e RestaurantAccountService (extrato e token)
  modules/<feature>/main.py  # router da feature
  utils/session.py      # cookies de sessão cifrados (JWE) e derive_key (HKDF)
  main.py               # monta a FastAPI e registra os routers
tests/
```

## Padrões

**Módulos.** Uma pasta por feature em `modules/<feature>/main.py`, com um
`APIRouter` chamado `router`, registrado em `api/main.py`. Não compartilhe
router entre features.

**Sessão do SIGAA.** Não há tabela de sessão: token e credenciais vivem em
cookies `httponly` cifrados com JWE (`dir` + `A256GCM`), uma chave por cookie
derivada via HKDF do `jwt_secret_key` (32+ caracteres). `exp` vai cifrado e é
obrigatório; qualquer outro formato (JWS, `zip`, outro `alg`/`enc`, cookie
trocado) vira `None`. Testes em `tests/test_session.py`. Dependências:

- `SigaaConnectionDep` — exige o refresh cookie, mas só abre o `SigaaClient` em
  `client()` (um client por requisição).
- `SigaaClientDep` — client já aberto, para rotas sem cache.
- `SigaaPublicClientDep` — sem cookie nem login.

Os cookies só renovam quando a requisição usa o SIGAA (`connection.client()` ou
relogin os regravam, sem `Set-Cookie` duplicado; falha descarta). Resposta do
cache não renova nada, e o cache só é servido com access_token válido — sem ele,
o `SyncEngine` loga antes. Assim uma senha trocada desloga em até
`access_token_expire_minutes`.

**Erros do SIGAA viram `HTTPException`** nas próprias dependências; nunca deixe
exceção do `sigaa_client` vazar da rota. `AuthenticationFailed` → 401 e apaga os
cookies (`clear_cookies_headers()`); `SessionExpired` → 401 mantendo os cookies;
resto → 502.

**Services e cache.** Rota não fala com repository nem com SIGAA: chama um
service, que resolve o dado com `SyncEngine.resolve(task, load)`
(stale-while-revalidate). O `load` (ou `SyncEngine.read`) lê o cache numa sessão
própria, fechada antes de ir ao SIGAA; services não usam o `get_db` da
requisição.
- Sem cache ou com `refresh`: a `Task` roda antes da resposta e o `load` relê.
- Cache vencido: sai na hora e a `Task` vira um `Job` na fila.
- Se outro sync vencer todas as tentativas de gravar, relê o que ele gravou;
  sem nada no cache, 503.

Cada `Task` busca e grava no engine; regras de revalidação e TTLs ficam em
`services/sync.py`. Nas telas de turma, o service passa o vínculo já lido
(`link=`). Todo dado novo do SIGAA que vale cache segue esse caminho.

**Jobs (QStash).** Nada roda depois da resposta (na Vercel a função pode parar).
O `SyncEngine` só conhece a `JobQueue`; a `QStashQueue` publica cada `Job` no
QStash, que entrega em `POST /jobs` (`modules/jobs`): confere `Upstash-Signature`,
decifra e chama `SyncEngine.run`.

- O job leva só o token da sessão, nunca a senha, cifrado com Fernet
  (`derive_key`). Sem relogin: `SessionExpired` → 204 (descarta; o próximo
  acesso reagenda). Erro passageiro → 502 (QStash tenta de novo).
- Um job por vez por usuário (flow control `sigaa-<matrícula>`, parallelism 1).
  Requisições do usuário ficam fora; o `sigaa_client` reabre a turma se outro
  uso da sessão a trocou no meio da leitura.
- Deduplicação: mesma `Job.key` na mesma sessão em até 10 min é descartada. A
  chave é hasheada (QStash recusa ':') e inclui o token, para sessão nova não
  cair na dedup da anterior.
- Um `AsyncQStash` por requisição (`get_job_queue`), fechado no fim: o pool do
  httpx fica preso ao event loop.
- O sync do login (`Task.ACCOUNT`) grava perfil e turmas e publica um job por
  tela de turma vencida.
- Falha ao publicar só vai para o log.

**Repositories.** Recebem `AsyncSession` e não fazem commit (o `SyncEngine`
faz). Identificação e mescla de usuários, turmas e participantes estão em
`repositories/classroom.py` e `repositories/user.py`. Não persista credenciais.
`save_members` grava em lote: usuários lidos de uma vez e casados em memória
(`_UserIndex`), sem consulta nem flush por participante (turmas podem ter
milhares).

**Modelos.** Toda tabela herda `Base, UUIDPrimaryKeyMixin, TimestampMixin`
(id UUID, `created_at`/`updated_at` automáticos). Enums do banco são
`str, enum.Enum` com `values_callable=lambda e: [m.value for m in e]`, para
gravar o `.value`.

**Settings.** `core/config.py`, lido de `.env` e instanciado no import: env
diferente (como nos testes) precisa ser setada **antes** do primeiro import de
`api.core.config` (veja `tests/conftest.py`).

## Criando um novo módulo/rota

1. Crie `api/modules/<feature>/main.py` com `router = APIRouter()`.
2. Use `SigaaClientDep`/`SigaaPublicClientDep` para o SIGAA e
   `Annotated[AsyncSession, Depends(get_db)]` para o banco.
3. Registre em `api/main.py`:
   `app.include_router(router, prefix="/<feature>", tags=["<feature>"])`.
   Rotas sem login ficam em `modules/public_<feature>`, prefixo
   `/public/<feature>` e tag `Public <Feature>`. Toda tag nova entra em
   `x-tagGroups` (`custom_openapi`), senão some do `/docs`.
4. Tabela nova vai em `db/models.py` (mixins acima) e `uv run db-init`.
   `create_tables` só cria o que falta: alterar tabela existente exige recriar o
   banco (não há migrations).
5. Dados do SIGAA que valem cache passam por um service com `SyncEngine.resolve`.
6. Teste com `respx` mockando `sigaa.unb.br`/`autenticacao.unb.br`.

## Testes

Fixtures em `tests/conftest.py`:
- `client` — usa um SQLite por teste (`database` prepara/confere o banco) e
  entrega os jobs publicados em `POST /jobs`, assinados, antes de devolver a
  resposta (`deliveries` guarda o resultado).
- `sigaa` — simula o SIGAA via respx.
- `stub_sigaa` — troca só o `SigaaClient` por `AsyncMock`s (`created` conta os
  clients abertos).
- `qstash` — intercepta a API do QStash (`published`).

## Comandos

```fish
uv run pytest apps/api       # testes da api (da raiz do monorepo)
docker compose up -d db      # Postgres local (compose.yml da raiz)
bunx @upstash/qstash-cli dev # QStash local
uv run db-init               # cria as tabelas
uv run api                   # api em dev (reload on)
```

Requer `apps/api/.env` com `database_url`, `jwt_secret_key`, `public_url` e as
chaves do QStash (`.env.example` traz as do dev server; veja `core/config.py`).
