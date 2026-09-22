# `sigaa-client`

Biblioteca Python assíncrona que abstrai a comunicação com o SIGAA da UnB —
dados públicos e autenticados — e devolve modelos Pydantic. Quem consome nunca
lida com cookie, `ViewState`, postback JSF ou HTML.

> Trabalhando **dentro** do pacote (novos scrapers, padrões, testes)? Veja
> [AGENTS.md](AGENTS.md).

## Instalação

Dentro do monorepo, o pacote é um membro do workspace `uv`:

```toml
# pyproject.toml do app que consome
dependencies = ["sigaa-client"]

[tool.uv.sources]
sigaa-client = { workspace = true }
```

```fish
uv sync
```

O módulo importável é `sigaa_client`. Requer Python >= 3.14.

## Get started

Tudo é `async` e o client é um context manager — ele é dono de uma conexão HTTP,
então use `async with` (ou chame `aclose()` no fim).

```python
import asyncio

from pydantic import SecretStr
from sigaa_client import Credentials, SigaaClient


async def main():
    credentials = Credentials(registration="251000000", password=SecretStr("..."))

    async with SigaaClient(credentials) as client:
        session_token = await client.authenticate()
        profile = await client.profile.get_profile()
        classrooms = await client.classrooms.list_classrooms()


asyncio.run(main())
```

O login acontece sob demanda: chamar qualquer método já autentica. `authenticate()`
é só a forma de fazer isso explicitamente e receber o token da sessão.

## Os dois clients

| Client | Precisa de login | Módulos |
| --- | --- | --- |
| `SigaaClient` | sim | `.profile`, `.classrooms`, `.restaurant` |
| `SigaaPublicClient` | não | `.classrooms` |

Cada módulo é um atributo do client, e cada método devolve modelo Pydantic
(frozen) ou lista deles.

### `SigaaClient` (autenticado)

```python
async with SigaaClient(credentials) as client:
    await client.profile.get_profile()  # UserProfile
    await client.classrooms.list_classrooms()  # turmas do semestre
    await client.classrooms.list_all_classrooms()  # histórico completo
    await client.classrooms.list_classroom_members(id)  # docentes e discentes
    await client.classrooms.get_classroom_frequency(id)  # frequência e andamento
    await client.classrooms.get_classroom_statistics(id)  # gráfico de estatísticas
    await client.restaurant.get_restaurant_statement()  # extrato do RU (7 dias)
    await client.restaurant.get_restaurant_credentials()  # token do QR e validade
    await client.logout()
```

O `id` dos métodos por turma (`list_classroom_members()`,
`get_classroom_frequency()`, `get_classroom_statistics()`) é o `Classroom.id` —
hash de 40 caracteres, estável entre sessões e presente tanto no semestre
corrente quanto no histórico.

`get_classroom_frequency()` devolve as duas coisas que a tela de frequência
mostra: `progress` (o "Andamento das Aulas" — aulas ministradas, total e a
porcentagem da carga horária) e `frequency`, o mapa de frequências com uma
entrada por aula e os totais do SIGAA. Nem todo docente lança frequência: aí
`frequency` vem `None` e só o `progress` é confiável — os totais que a tela
mostra nesse caso são fictícios (100% de presença em toda a CH).

`get_classroom_statistics()` devolve as 9 fatias do gráfico "Estatísticas da
Turma" (`StatisticsShare`), sempre todas, inclusive as zeradas. O SIGAA só
desenha esse gráfico como imagem: os números saem da legenda do PNG, lidos
glifo a glifo. Como cada fatia vem arredondada em uma casa, a soma pode fechar
em 99.9 ou 100.1 — e a contagem de alunos por situação não existe na tela.

`get_restaurant_statement()` devolve `None` para quem não tem extrato no RU.
`get_restaurant_credentials()` lê o PDF da carteirinha estudantil: o token vem
do QR code e `valid_until` do mês/ano impresso (o dia vem sempre `1`).

Turmas de semestres passados vêm com `room`, `sigaa_id` e `subject.unity` em
`None`: o SIGAA não guarda esses dados fora do semestre corrente.

### `SigaaPublicClient` (sem login)

A unidade ofertante é filtro obrigatório do SIGAA — não há como listar todas as
turmas de uma vez.

```python
from sigaa_client import SigaaPublicClient, TeachingLevel

async with SigaaPublicClient() as client:
    unidades = await client.classrooms.list_units("gama")  # list[Unit]
    turmas = await client.classrooms.search(
        "gama", level=TeachingLevel.GRADUACAO
    )  # list[PublicClassroom]
```

`search()` aceita a unidade como `Unit`, como id numérico (`673`) ou como um
pedaço do nome (`"gama"`) — resolver pelo nome não custa request a mais. `level`,
`year` e `period` são opcionais; sem ano/período vale o semestre que o SIGAA já
traz preenchido. O acervo público é curto: 2025 e anteriores devolvem `[]`.

`PublicClassroom` não tem `id` — a área pública não expõe o identificador de
turma. A identidade lá é a chave natural `(subject.code, number, semester)`.

## Sessão e token

O SIGAA não emite token: a credencial é o cookie `JSESSIONID`. `authenticate()`
devolve esse valor, que pode ser guardado (é o que `apps/api` coloca no JWT de
acesso) e reusado depois, sem passar pelo CAS:

```python
async with SigaaClient(credentials) as client:
    session_token = await client.authenticate()

async with SigaaClient(session_token=session_token) as client:
    ...  # requests autenticadas, sem novo login
```

Construído só com o token, o client não tem senha para reautenticar: quando a
sessão morre, levanta `SessionExpired`. Com `credentials`, o relogin acontece
sozinho e o chamador não percebe.

Passando os dois, `on_session_renewed` avisa quando o relogin trocou a sessão —
é assim que uma API reemite o cookie de acesso no meio da request, em vez de
devolver 401:

```python
async with SigaaClient(
    credentials,
    session_token=session_token,
    on_session_renewed=guardar_token,  # recebe o token novo; pode ser async
) as client:
    ...
```

`Credentials.password` é `SecretStr` e não deve ser logada nem persistida em
disco. Este pacote não conhece o esquema de auth do Followw: quem decifra a
senha do JWT é `apps/api`.

## Erros

Todos derivam de `SigaaError`, então `except SigaaError` cobre o pacote inteiro.

| Exceção | Significa |
| --- | --- |
| `AuthenticationFailed` | matrícula ou senha inválida |
| `SessionExpired` | a sessão morreu e não há credenciais para refazer o login |
| `SigaaParseError` | o SIGAA mudou de layout — a página não tem o que se esperava |
| `SigaaSearchError` | o SIGAA recusou os filtros da busca (a mensagem é a da tela) |

Busca que simplesmente não achou nada devolve `[]`, não levanta erro.

## O que ainda não existe

- `UserProfile.email`: o portal do discente só mostra a versão truncada
  (`fulano@gmail...`), então vem `None`. O e-mail completo está na lista de
  participantes — o próprio usuário aparece entre os discentes das suas turmas.
- Notas e frequência.
