# `sigaa-client`

O SIGAA Client é uma biblioteca python que faz scrapping do SIGAA UnB,
tanto dos portais públicos quanto autenticados, e retorna-os em modelos Pydantic.

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
```

| Client              | Login | Módulos                                  |
| ------------------- | ----- | ---------------------------------------- |
| `SigaaClient`       | sim   | `.profile`, `.classrooms`, `.restaurant` |
| `SigaaPublicClient` | não   | `.classrooms`                            |

O login é feito sob demanda. O token retornado por `authenticate()` pode ser
reutilizado com `SigaaClient(session_token=...)`: sem credenciais, uma sessão
expirada levanta `SessionExpired`.

Todos os erros derivam de `SigaaError`.

`client.restaurant.get_restaurant_statement()` retorna saldo, extrato e grupo (1 a 4), com saldo e grupo ausentes representados por `None`.

`client.classrooms.get_classroom_grade(id)` retorna a menção (`Grade`) do "Resultado" da tela "Ver Notas", ou `None` enquanto não houver nota lançada.
