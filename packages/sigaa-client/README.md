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
| `SigaaPublicClient` | não   | `.classrooms`, `.subjects`               |

O login é feito sob demanda. O token retornado por `authenticate()` pode ser reutilizado com
`SigaaClient(session_token=...)`: sem credenciais, uma sessão expirada levanta `SessionExpired`.

Todos os erros derivam de `SigaaError`.

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

`client.documents.get_student_card_pdf()` retorna os bytes do PDF original da carteirinha
estudantil. `client.restaurant.get_restaurant_credentials()` usa esse mesmo download para extrair o token do QR code
e a validade, sem persistir o arquivo.

`client.documents.get_transcript_pdf()` baixa o PDF original do histórico acadêmico.
`client.documents.get_enrollment_certificate_pdf()` emite o atestado de matrícula e converte
o HTML de impressão do SIGAA para PDF A4 localmente, preservando o código de verificação.
Os estilos e imagens são carregados pela mesma sessão do SIGAA; o arquivo não é persistido.

A conversão do atestado requer Chromium: após `uv sync`, execute
`uv run playwright install chromium` (em Linux, `uv run playwright install --with-deps chromium`).

`client.classrooms.get_classroom_grade(id)` retorna a menção (`Grade`) do "Resultado" da tela "Ver
Notas", ou `None` enquanto não houver nota lançada.

`SigaaPublicClient().classrooms.iter_subjects(unidade)` percorre os componentes de graduação
ofertados por uma unidade e entrega cada um como `SubjectDetails`: o `Subject` com `prerequisites`,
`corequisites` e `equivalences` (só a expressão ativa), como o SIGAA as escreve, ou `None` quando
não há.
