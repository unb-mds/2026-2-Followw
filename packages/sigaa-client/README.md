# `sigaa-client`

O SIGAA Client é uma biblioteca python que faz scrapping do SIGAA UnB, tanto dos portais públicos
quanto autenticados, e retorna-os em modelos Pydantic.

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
```

| Client              | Login | Módulos                                  |
| ------------------- | ----- | ---------------------------------------- |
| `SigaaClient`       | sim   | `.profile`, `.classrooms`, `.documents`, `.restaurant` |
| `SigaaPublicClient` | não   | `.classrooms`, `.subjects`, `.curricula`  |

O login é feito sob demanda. O token retornado por `authenticate()` pode ser reutilizado com
`SigaaClient(session_token=...)`: sem credenciais, uma sessão expirada levanta `SessionExpired`.

Todos os erros derivam de `SigaaError`.

`client.curricula.list_curricula(course_sigaa_id)` lista as estruturas de um curso, com ID,
código, ano de criação, turno e status. `get_curriculum(course_sigaa_id, sigaa_id)` retorna
o turno em letras (`D` para diurno ou `N` para noturno; `None` quando indefinido) e
também a matriz, `valid_from` (semestre de entrada em vigor), `required_by_period` (array de
objetos com `period` e array `required` de códigos), `optional` e `complementary` (arrays de
códigos). O período é o nível informado pelo SIGAA, inclusive zero quando presente.
Optativas indicadas dentro dos períodos também entram em `optional`, sem duplicatas.

```sh
uv run python packages/sigaa-client/scripts/collect_curricula.py --year 2026
uv run python packages/sigaa-client/scripts/collect_curricula.py --latest-only
```

A coleta usa os IDs de `data/courses.csv` e gera `data/curricula.csv` (metadados das matrizes)
e `data/curriculum_components.csv` (uma linha por período de cada matriz) após concluir todos os cursos.
Cada linha reúne os códigos em `subject_codes`, separados por espaço; períodos vazios têm o campo vazio.
As optativas têm período `0`, as obrigatórias mantêm seu período e as complementares ficam
com período vazio. A coluna `kind` distingue `required`, `optional` e `complementary`.
Os arquivos se relacionam por curso e ID da matriz no SIGAA. Por padrão seleciona estruturas
ativas criadas no ano de referência e nos
três anteriores, mais a última versão anterior à janela, por turno, para cobrir ingressos
antes da primeira revisão. Sem revisões recentes, fica a mais recente; empates são preservados.
Se a única estrutura ativa for futura, ela é preservada com sua vigência original; consultas
por ingresso devem respeitar `valid_from`. Cursos sem estruturas ativas ficam fora dos CSVs.
`--latest-only` mantém apenas o ano mais recente por turno. O semestre efetivo é preservado
em `valid_from`; o ano de criação serve apenas para selecionar o conjunto a coletar.
`--course ID` permite uma coleta parcial, exigindo um `--output-dir` diferente de `data/`.

O `uv run db-init` da API cria as tabelas `curricula` e `curriculum_components` e executa seu
seed após o de cursos.
Para carregar somente currículos em um banco que já tenha cursos, execute
`uv run db-seed-curricula` em `apps/api` (usa o `.env` dessa pasta e cria as tabelas se necessário).
O seed resolve `course_sigaa_id` para a chave local de `courses`, valida os dois CSVs e atualiza
as matrizes sem duplicá-las. Os componentes das matrizes carregadas são substituídos na mesma
transação, expandindo os códigos de cada período em vínculos individuais e removendo vínculos obsoletos.
Seus códigos não exigem uma entrada em `subjects`,
pois o catálogo de disciplinas ofertadas não contém todos os componentes históricos.

`client.subjects.search(unit=None, level=TeachingLevel.GRADUACAO, type=None, code=None, name=None)`
consulta o catálogo público com filtros combináveis. `unit` aceita `Unit`, ID ou trecho não ambíguo
do nome; `code` e `name` aceitam trechos. `SubjectLevel` restringe `TeachingLevel` a F, G, L, R e S;
`SubjectType` aceita DISCIPLINA, ATIVIDADE, BLOCO e MÓDULO. Identifique os componentes por
`sigaa_id`, pois códigos podem se repetir entre níveis.

O retorno `SubjectSearchResult` contém `items`, `returned_count`, `messages` e `truncated`. O aviso
de limite de 2000 resultados preserva a lista parcial e marca `truncated=True`; refine os filtros
para obter resultados completos. Busca vazia retorna `items=()` e a mensagem da origem; filtros
recusados levantam `SigaaSearchError`.

Na página do SIGAA, o aviso aparece acima do formulário, abaixo do cabeçalho, no painel
`#painel-erros` (`ul.erros`), com texto vermelho e ícone. Fechar o painel apenas o remove da tela;
uma nova busca que exceda o limite faz o aviso reaparecer. O client preserva seu texto em
`messages`.

`client.restaurant.get_restaurant_statement()` retorna saldo, extrato e grupo (1 a 4), com saldo e
grupo ausentes representados por `None`.

`client.classrooms.list_grades()` retorna todas as menções de "Ensino > Consultar Minhas Notas"
num único relatório. Cada `ClassroomGrade` traz `subject_code`, `semester` e a menção (`Grade`)
do "Resultado", ou `None` enquanto não houver nota lançada.
`client.documents.get_student_card_pdf()` retorna os bytes do PDF original da carteirinha
estudantil. `client.restaurant.get_restaurant_credentials()` usa esse mesmo download para extrair o token do QR code
e a validade, sem persistir o arquivo.
`client.documents.get_transcript_pdf()` baixa o PDF original do histórico acadêmico.

`SigaaPublicClient().classrooms.iter_subjects(unidade)` percorre os componentes de graduação
ofertados por uma unidade e entrega cada um como `SubjectDetails`: o `Subject` com `prerequisites`,
`corequisites` e `equivalences` (só a expressão ativa), como o SIGAA as escreve, ou `None` quando
não há.
