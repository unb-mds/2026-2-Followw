# Followw api — guia para agentes

API pública do Followw UnB, em FastAPI. Fala com o SIGAA através do
sigaa_client e guarda dados próprios em Postgres via SQLAlchemy assíncrono.

## Layout

```
api/
  core/
    config.py       # Settings (pydantic-settings), lido de .env
  db/
    base.py          # Base, UUIDPrimaryKeyMixin, TimestampMixin
    enums.py          # enums do banco (str Enum)
    models.py         # modelos SQLAlchemy
    main.py           # engine, async_session, get_sessionmaker, get_db, db-init
  dependencies/
    sigaa.py           # SigaaConnectionDep (preguiçosa) e SigaaClientDep
    sigaa_public.py     # SigaaPublicClientDep — cliente público
    refresh.py          # RefreshQuery — `?refresh=true` que ignora o cache
  repositories/
    user.py             # UserRepository e UserRepositoryDep
    classroom.py        # ClassroomRepository e ClassroomRepositoryDep
  services/
    sync.py             # SyncEngine: stale-while-revalidate e sync do login
    profile.py          # ProfileService (GET /me)
    classroom.py        # ClassroomService (turmas, participantes, estatísticas)
  modules/
    <feature>/
      main.py            # router da feature
  utils/
    session.py           # cookies JWT de sessão
  main.py                 # monta a FastAPI, registra os routers
tests/
```

## Padrões

**Módulos.** Uma pasta por feature em `modules/<feature>/main.py`, expondo um
`APIRouter` chamado `router`. Registrado em `api/main.py` com
`app.include_router(router, prefix="/<feature>", tags=["<feature>"])`. Não
compartilhe router entre features.

**Sessão do SIGAA.** Não existe tabela de sessão: o token do SIGAA e as
credenciais vivem em cookies `httponly` assinados com JWT (`utils/session.py`).
O client vem por `Depends` (`dependencies/`):

- `SigaaConnectionDep` — exige refresh cookie, mas só abre o `SigaaClient` em
  `open()`; `detached()` é a cópia sem cookies para o background.
- `SigaaClientDep` — o client já aberto, para rotas sem cache.
- `SigaaPublicClientDep` — sem cookie, sem login.

Toda resposta de sucesso de uma rota autenticada, inclusive as que saem do
cache, renova os dois cookies (access por `access_token_expire_minutes`). Isso
acontece antes da rota rodar, porque o teardown do `yield` roda tarde demais.
Um 401 do SIGAA (`AuthenticationFailed`/`SessionExpired`) apaga os dois cookies
via `clear_cookies_headers()`.

**Erros do SIGAA viram `HTTPException`** (401 para credencial/sessão, 502 para o
resto) nas próprias dependências. Nunca deixe exceção do `sigaa_client` vazar da
rota.

**Services e cache.** Rota não fala com repository nem com SIGAA: chama um
service (`services/`), que resolve o dado por `SyncEngine.resolve`
(stale-while-revalidate, gravação em background via `BackgroundTasks`). As
regras de revalidação e os TTLs ficam em `services/sync.py`. O sync completo do
login é o `SyncEngine.sync_account()`. Todo dado novo do SIGAA que vale cache
segue esse caminho.

**Repositories.** Consultas e gravações ficam em `repositories/`, recebem
`AsyncSession` e não fazem commit (quem faz é o `SyncEngine`). Como usuários,
turmas e participantes são identificados e mesclados está em
`repositories/classroom.py` e `repositories/user.py`. Não persista credenciais.

**Modelos SQLAlchemy.** Toda tabela herda `Base, UUIDPrimaryKeyMixin,
TimestampMixin` (`db/base.py`): id é UUID, `created_at`/`updated_at`
automáticos. Enums do banco são `str, enum.Enum` com
`values_callable=lambda e: [m.value for m in e]`, para o valor do banco ser o
`.value` do enum, não o nome do membro.

**Settings.** `Settings` (`core/config.py`) lê `.env` via
`pydantic-settings`. É instanciado no import do módulo — qualquer coisa que
precise de uma variável de ambiente diferente (como os testes) precisa setá-la
**antes** do primeiro import de `api.core.config` (veja `tests/conftest.py`).

## Criando um novo módulo/rota

1. Crie `api/modules/<feature>/main.py` com `router = APIRouter()`.
2. Declare as rotas nele; use `SigaaClientDep`/`SigaaPublicClientDep` se
   precisar do SIGAA, `Annotated[AsyncSession, Depends(get_db)]` se precisar
   do banco.
3. Registre em `api/main.py`:
   `app.include_router(router, prefix="/<feature>", tags=["<feature>"])`.
4. Se a feature usa tabela nova, modele em `db/models.py` (mixins acima) e
   rode `db-init`. `create_tables` só cria o que falta: mudança em tabela
   existente exige recriar o banco (ainda não há migrations).
5. Dados do SIGAA que valem cache passam por um service com
   `SyncEngine.resolve` (acima), não pela rota.
6. Teste com `respx` mockando `sigaa.unb.br`/`autenticacao.unb.br` (abaixo).

## Testes

Fixtures em `tests/conftest.py`: `client` já usa um SQLite por teste
(`database` para preparar/conferir o banco), `sigaa` simula o SIGAA via respx e
`stub_sigaa` troca só o `SigaaClient` por `AsyncMock`s. O `TestClient` roda as
`BackgroundTasks` antes de devolver a resposta.

## Comandos

```fish
uv run pytest apps/api      # só os testes da api (da raiz do monorepo)
docker compose up -d db      # sobe o Postgres local (compose.yml da raiz)
uv run db-init                # cria as tabelas (schema mudou? recrie o banco)
uv run api                     # sobe a api em dev (reload on)
```

Requer `apps/api/.env` com `database_url`, `jwt_secret_key` (veja
`core/config.py` para os demais campos e defaults).
