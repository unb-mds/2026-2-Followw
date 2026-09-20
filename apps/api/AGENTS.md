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
    main.py           # engine, async_session, get_db, db-init
  dependencies/
    sigaa.py           # SigaaClientDep — cliente autenticado
    sigaa_public.py     # SigaaPublicClientDep — cliente público
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

**Sessão do SIGAA.** Não existe tabela de sessão no banco: o `access_token`
(token de sessão do `sigaa_client`) e o `refresh_token` (credenciais) vivem em
cookies `httponly` assinados com JWT (`api/utils/session.py`). O client SIGAA
é obtido via `Depends`:

- `SigaaClientDep` (`dependencies/sigaa.py`) — exige refresh cookie, autentica
  sob demanda se não houver access cookie válido, e renova o access cookie
  quando o `sigaa_client` troca a sessão sozinho (`on_session_renewed`).
- `SigaaPublicClientDep` (`dependencies/sigaa_public.py`) — sem cookie, sem
  login.

**Erros do SIGAA viram `HTTPException`.** `AuthenticationFailed`/
`SessionExpired` → 401; qualquer outro `SigaaError` ou `httpx.HTTPError` → 502
("SIGAA is unavailable" ou a mensagem da exceção). Nunca deixe uma exceção do
`sigaa_client` vazar para fora da rota.

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
   rode `db-init` (ou reinicie — `create_tables` não é destrutivo, só cria o
   que falta).
5. Teste com `respx` mockando `sigaa.unb.br`/`autenticacao.unb.br` (abaixo).

## Comandos

```fish
uv run pytest apps/api      # só os testes da api (da raiz do monorepo)
docker compose up -d db      # sobe o Postgres local (compose.yml da raiz)
uv run db-init                # cria as tabelas
uv run api                     # sobe a api em dev (reload on)
```

Requer `apps/api/.env` com `database_url`, `jwt_secret_key` (veja
`core/config.py` para os demais campos e defaults).
