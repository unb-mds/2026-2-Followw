# `sigaa-client`

Biblioteca Python que consulta os portais públicos e autenticados do SIGAA UnB e retorna modelos
Pydantic.

## Exemplo de uso

```python
from pydantic import SecretStr
from sigaa_client import Credentials, SigaaClient, SigaaPublicClient

credentials = Credentials(registration="251000000", password=SecretStr("..."))

async with SigaaClient(credentials) as client:
    profile = await client.profile.get_profile()
    classrooms = await client.classrooms.list_classrooms()

async with SigaaPublicClient() as client:
    turmas = await client.classrooms.search("gama")
    componentes = await client.subjects.search("gama", code="FGA00")
    docentes = await client.professors.search("gama")
```

| Client              | Login | Módulos                                                |
| ------------------- | ----- | ------------------------------------------------------ |
| `SigaaClient`       | sim   | `.profile`, `.classrooms`, `.documents`, `.restaurant` |
| `SigaaPublicClient` | não   | `.classrooms`, `.subjects`, `.curricula`, `.professors` |

O login é feito sob demanda. O token retornado por `authenticate()` pode ser reutilizado com
`SigaaClient(session_token=...)`: sem credenciais, uma sessão expirada levanta `SessionExpired`.

Todos os erros derivam de `SigaaError`.

`client.curricula.list_curricula(course_sigaa_id)` lista as estruturas de um curso.
`get_curriculum(course_sigaa_id, sigaa_id)` retorna a matriz, vigência (`valid_from`), turno
(`D` ou `N`) e componentes: `required_by_period` agrupa códigos obrigatórios em `required` por
`period`; `optional` e `complementary` reúnem os demais códigos. Optativas encontradas dentro dos
períodos também entram em `optional`, sem duplicatas. Os períodos obrigatórios são positivos.

As cargas horárias são expressas em horas: `total_workload` é o mínimo total; `required_workload`
é a carga obrigatória; os campos `*_min_workload` e `*_max_workload` indicam limites por categoria
ou período. `min_semesters`, `avg_semesters` e `max_semesters` são prazos de conclusão em semestres.
Dados ausentes são `None`; os campos completos estão no [modelo Curriculum](sigaa_client/models.py).

```sh
uv run python packages/sigaa-client/scripts/collect_curricula.py --year 2026
uv run python packages/sigaa-client/scripts/collect_curricula.py --latest-only
```

A coleta lê `data/courses.csv` e gera `data/curricula.csv` e `data/curriculum_components.csv`.
O primeiro contém metadados; o segundo tem uma linha por período da matriz, com códigos separados
por espaço em `subject_codes`. `kind` distingue obrigatórias (`required`, período positivo),
optativas (`optional`, período `0`) e complementares (`complementary`, período vazio). Os CSVs se
relacionam pelo curso e ID da matriz no SIGAA; períodos sem matérias têm `subject_codes` vazio.

A seleção inclui matrizes ativas criadas no ano de referência e nos três anteriores, mais a última
anterior por turno. Sem revisões recentes, mantém a mais recente; empates são preservados. Quando
só há matrizes futuras ativas, mantém as mais recentes, sem antecipar sua vigência. Cursos sem
matrizes ativas não entram na coleta. O ano de criação seleciona o conjunto coletado; consultas por
ingresso devem respeitar o semestre de vigência em `valid_from`.

`--latest-only` mantém apenas o ano mais recente por turno; `--course ID` faz coleta parcial e exige
`--output-dir` diferente de `data/`, para não substituir o dataset completo. Os CSVs só são
substituídos após concluir a coleta de todos os cursos selecionados.

O `uv run db-init` da API valida e importa os CSVs após o seed de cursos, atualizando matrizes e
substituindo seus componentes na mesma transação. Matrizes ausentes da coleta ficam inativas,
preservando componentes e vínculos de usuários. Os códigos podem incluir matérias históricas que
não estão em `subjects`.

`client.subjects.search(unit=None, level=TeachingLevel.GRADUACAO, type=None, code=None, name=None)`
consulta o catálogo público com filtros combináveis.
`unit` aceita `Unit`, ID ou trecho não ambíguo do nome; `code` e `name` aceitam trechos.
`level` usa `SubjectLevel` (F, G, L, R ou S); `type` usa `SubjectType` (DISCIPLINA, ATIVIDADE,
BLOCO ou MÓDULO).
Identifique componentes por `sigaa_id`, pois códigos podem se repetir entre níveis.

O retorno `SubjectSearchResult` contém `items`, `returned_count`, `messages` e `truncated`.
Se o SIGAA sinalizar o limite de 2000 resultados, preserva a lista parcial e marca `truncated=True`;
refine os filtros para obter resultados completos. Busca vazia retorna `items=()` e a mensagem da origem;
filtros recusados levantam `SigaaSearchError`.

`client.subjects.get_details(subject)` abre o resumo de um `PublicSubject` da busca e devolve o
mesmo `SubjectDetails` de `iter_subjects`, com requisitos e carga horária, mesmo sem oferta no
semestre.

`client.restaurant.get_restaurant_statement()` retorna saldo, extrato e grupo (1 a 4), com saldo e
grupo ausentes representados por `None`.

`client.classrooms.list_grades()` retorna todas as menções de "Ensino > Consultar Minhas Notas" num
único relatório. Cada `ClassroomGrade` traz `subject_code`, `semester` e a menção (`Grade`) do
"Resultado", ou `None` enquanto não houver nota lançada. `client.documents.get_student_card_pdf()`
retorna os bytes do PDF original da carteirinha estudantil.
`client.restaurant.get_restaurant_credentials()` usa esse mesmo download para extrair o token do QR
code e a validade, sem persistir o arquivo. `client.documents.get_transcript_pdf()` baixa o PDF
original do histórico acadêmico. Quando o SIGAA recusa emitir o documento (ex.: perfil sem foto), os
três levantam `DocumentUnavailable` com o motivo informado por ele (`MissingProfilePhoto` quando falta foto).

`SigaaPublicClient().classrooms.iter_subjects(unidade)` percorre os componentes de graduação
ofertados por uma unidade e entrega cada um como `SubjectDetails`: o `Subject` com `prerequisites`,
`corequisites` e `equivalences` (só a expressão ativa), como o SIGAA as escreve, ou `None` quando
não há.

`collect_subjects.py` também completa os componentes obrigatórios das matrizes e os citados nos
requisitos pelo catálogo público, mesmo sem oferta no semestre, já com os requisitos de cada um (e
os componentes que estes citarem). Linhas sem unidade são completadas de novo a cada execução. Para
completar um CSV existente, rode da raiz do monorepo:
`uv run python packages/sigaa-client/scripts/complete_subjects.py`.
Depois execute `uv run db-init` em `apps/api/` para carregar o catálogo no banco local.

### Posts da turma

`await client.classrooms.list_classroom_posts(classroom_id)` reúne notícias, tópicos
de aula, materiais dos tópicos e a agenda de avaliações em `ClassroomPost`.
`type` usa `PostType`: `news`, `topic`, `material` ou `assessment`. `id` é uma chave
opaca por turma, com prefixo da categoria; `topic_id` vincula cada material ao tópico.
A lista principal é aberta em modo lista, mesmo se a sessão estiver paginada.

Tópicos expõem `starts_on`, `ends_on` e texto em Markdown. Como a lista do SIGAA
não expõe seus IDs, a chave do tópico deriva do título e período; editar esses
campos produz outra chave. Materiais preservam o identificador de origem em
`sigaa_id`; `url` só é preenchida quando há um link HTTP direto. Arquivos que
exigem postback não recebem URLs fictícias, e seus bytes não são armazenados.
Avaliações preservam data e horário (`starts_at` quando preciso, `time_label`
para textos como “Hora da aula”), sem notas individuais nem datas de publicação
inventadas. O vínculo da avaliação ao tópico só existe se informado pela origem.

Notícias da lista trazem título e dia; use `get_classroom_news` com o `sigaa_id`
para texto e anexos.

`await client.classrooms.list_dashboard_posts()` lê a home do SIGAA e devolve
`DashboardPost`: as notícias das "Últimas Atualizações" e as avaliações de
"Minhas atividades". A home não traz IDs, então o detalhe fica nos posts da turma
(`classroom_sigaa_id`); avaliação de disciplina que não casa com uma única turma
do portal vem sem turma.
