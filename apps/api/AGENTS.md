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
    qstash.py           # QStashQueue (JobQueueDep) e o job recebido (JobDep)
    sync.py             # SyncEngineDep e JobEngineDep
  repositories/
    user.py             # UserRepository e UserRepositoryDep
    classroom.py        # ClassroomRepository e ClassroomRepositoryDep
  services/
    sync.py             # SyncEngine, Task, Job e JobQueue: cache e jobs do sync
    profile.py          # ProfileService (GET /me)
    classroom.py        # ClassroomService (turmas, participantes, estatísticas)
  modules/
    <feature>/
      main.py            # router da feature
  utils/
    session.py           # cookies de sessão criptografados (JWE) e derive_key (HKDF, também usada pelos jobs)
  main.py                 # monta a FastAPI, registra os routers
tests/
```

## Padrões

**Módulos.** Uma pasta por feature em `modules/<feature>/main.py`, expondo um
`APIRouter` chamado `router`. Registrado em `api/main.py` com
`app.include_router(router, prefix="/<feature>", tags=["<feature>"])`. Não
compartilhe router entre features.

**Sessão do SIGAA.** Não existe tabela de sessão: o token do SIGAA e as
credenciais vivem em cookies `httponly` criptografados com JWE (`utils/session.py`):
`dir` + `A256GCM`, uma chave por cookie derivada (HKDF) do `jwt_secret_key`, que
precisa de 32+ caracteres. Quem copia o cookie do navegador não lê a senha nem o
token. Na leitura só esse perfil passa: JWS, `zip`, outro `alg`/`enc` ou um
cookie no lugar do outro viram `None`. `exp` vai cifrado e é obrigatório. Os testes de segurança dessa etapa ficam em `tests/test_session.py`.
O client vem por `Depends` (`dependencies/`):

- `SigaaConnectionDep` — exige refresh cookie, mas só abre o `SigaaClient` em
  `client()`. É um client só por requisição.
- `SigaaClientDep` — o client já aberto, para rotas sem cache.
- `SigaaPublicClientDep` — sem cookie, sem login.

Os dois cookies só renovam quando a requisição usa o SIGAA: cada
`connection.client()` e cada relogin os regravam (substituindo, sem repetir o
`Set-Cookie`), e se a chamada falhar a `HTTPException` os descarta. Resposta que
sai do cache não renova nada, e o cache só é servido com um access_token válido;
sem ele, o `SyncEngine` loga no SIGAA antes. Assim uma senha trocada desloga o
usuário em até `access_token_expire_minutes`. `AuthenticationFailed` (senha
recusada) vira 401 e apaga os dois cookies via `clear_cookies_headers()`;
`SessionExpired` também é 401, mas mantém os cookies, porque a credencial ainda
pode valer.

**Erros do SIGAA viram `HTTPException`** (401 para credencial/sessão, 502 para o
resto) nas próprias dependências. Nunca deixe exceção do `sigaa_client` vazar da
rota.

**Services e cache.** Rota não fala com repository nem com SIGAA: chama um
service (`services/`), que resolve o dado por `SyncEngine.resolve(task, load)`
(stale-while-revalidate). O cache é lido pelo `load` (ou `SyncEngine.read`),
numa sessão própria que fecha antes de ir ao SIGAA: services não usam a sessão
`get_db` da requisição. Sem cache ou com `refresh`, a `Task` roda antes da
resposta e o `load` relê o cache; vencido, o cache sai na hora e a `Task` vira
um `Job` na fila. Se outro sync vencer todas as tentativas de gravar, o `load`
relê o que ele gravou; sem nada no cache ainda, a resposta é 503. Nas telas de
turma, o service passa o vínculo já lido (`link=`) para o engine não relê-lo.
Cada `Task` busca e grava no engine, então as regras de
revalidação e os TTLs ficam em `services/sync.py`. Todo dado novo do SIGAA que
vale cache segue esse caminho: uma `Task` no engine e um `load` no service.

**Notícias.** `/news`, `/classrooms/{id}/news` e `/classrooms/{id}/news/{news_id}` usam `NewsService` com
`SigaaClientDep`, sem banco, fila ou cache (`Cache-Control: no-store`). A rota
por turma lê só o portal (`list_current_classrooms`) para traduzir o `sigaa_id`
e preencher `classroom_sigaa_id`; quem confere se a turma é do usuário é o
próprio client, com `ClassroomNotFound` (404) quando ela não está no histórico.
As respostas são
as listagens do scraper: notícias recentes da home ou títulos e datas da turma;
texto completo em Markdown, horário e anexos vêm da rota de detalhe, que
confere também se a notícia está na listagem da turma antes de abri-la.

**Restaurante.** `/restaurant/menu` é público, usa `UnbBrowserDep` e aceita
`campus` (`Darcy`, `Gama`, `Ceilandia`, `Planaltina`, `Fazenda`, padrão `Darcy`)
e `refresh`. Datas: `date` para um dia ou `start_date`/`end_date` para intervalo
inclusivo (aceita apenas um limite), sem combinar os dois modos. Filtros são
aplicados depois da leitura: o cache sempre mantém todos os dias publicados.
`meal` aceita `breakfast`, `lunch` ou `dinner`: cada dia mantém a data e apenas
a refeição escolhida (ou `null`, se ausente). Sem `meal`, mantém todas as refeições.
`RestaurantService` guarda uma
lista de dias por campus em `restaurant_menus`, válida por 6h; grava antes de
responder, sem jobs. Sessões do banco fecham antes da consulta ao site; erros
de leitura/gravação não impedem servir o cardápio obtido do RU. O repository
não faz commit. Cache vazio também tem TTL. Crie a tabela nova com `db-init`.
`/restaurant/statement` e `/restaurant/token` usam `RestaurantAccountService`
com `SigaaClientDep`, sem banco/fila e com `Cache-Control: no-store`. A API repassa
o `RestaurantStatement` montado pelo `sigaa-client`, que infere saldo e grupo
(1/2/3) pelas entradas mais recentes que os informam. Sem esses dados, devolve
`null`, nunca presume grupo ou saldo.

**Jobs (QStash).** Nada roda depois da resposta no processo da API (na Vercel a
função pode parar): o `SyncEngine` só conhece a `JobQueue`, e a `QStashQueue`
(`dependencies/qstash.py`) publica cada `Job` no QStash, que o entrega em
`POST /jobs` (`modules/jobs`). A rota confere a assinatura (`Upstash-Signature`),
decifra o job e chama `SyncEngine.run`. Decisões:

- O job leva só o token da sessão do SIGAA, nunca a senha, e vai cifrado
  (Fernet, chave de `derive_key`). Sem senha não há relogin:
  `SessionExpired` descarta o job (204) e o próximo acesso agenda outro. Erro
  passageiro do SIGAA devolve 502 e o QStash tenta de novo.
- Um job por vez por usuário (flow control `sigaa-<matrícula>`, parallelism 1),
  para os jobs não disputarem a sessão do SIGAA entre si. As requisições do
  próprio usuário usam a mesma sessão e ficam fora do flow control: quem segura
  a troca de turma é o `sigaa_client`, que reabre a turma se outro uso da sessão
  a trocou no meio da leitura.
- A mesma `Job.key` na mesma sessão, publicada em até 10 minutos, é descartada
  (deduplicação do QStash, em hash: o QStash recusa ':'). O token entra na
  chave para o job de uma sessão nova não cair na deduplicação do job que
  morreu com a anterior.
- Um `AsyncQStash` por requisição (`get_job_queue`), fechado no fim: o pool do
  httpx fica preso ao event loop que o abriu.
- O sync do login (`Task.ACCOUNT`) grava perfil e turmas e publica um job por
  tela de turma vencida: o sync inteiro não cabe numa requisição só.
- Falhar ao publicar não derruba a requisição: só vai para o log.

**Repositories.** Consultas e gravações ficam em `repositories/`, recebem
`AsyncSession` e não fazem commit (quem faz é o `SyncEngine`). Como usuários,
turmas e participantes são identificados e mesclados está em
`repositories/classroom.py` e `repositories/user.py`. Não persista credenciais.
Participantes são gravados em lote (`save_members`): uma turma pode ter milhares,
então os usuários são lidos de uma vez e casados em memória (`_UserIndex`), sem
consulta nem flush por participante.

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
`stub_sigaa` troca só o `SigaaClient` por `AsyncMock`s (`created` conta os
clients abertos). `qstash` intercepta a API do QStash e guarda o que foi
publicado (`published`); o `client` entrega esses jobs em `POST /jobs`,
assinados, antes de devolver a resposta (`deliveries` guarda o resultado).

## Comandos

```fish
uv run pytest apps/api      # só os testes da api (da raiz do monorepo)
docker compose up -d db      # sobe o Postgres local (compose.yml da raiz)
npx --allow-scripts=@upstash/qstash-cli @upstash/qstash-cli dev   # QStash local (o npm 12 só baixa o binário com --allow-scripts)
uv run db-init                # cria as tabelas (schema mudou? recrie o banco)
uv run api                     # sobe a api em dev (reload on)
```

Requer `apps/api/.env` com `database_url`, `jwt_secret_key`, `public_url` e as
chaves do QStash (`.env.example` traz as do dev server; veja `core/config.py`).
