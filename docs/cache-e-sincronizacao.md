# Cache, TTL e sincronização da API

Resumo das regras que decidem **quando a API serve o cache, quando vai ao SIGAA e quando não sincroniza**.
O código vive em `apps/api/api/sync/` (motor), `cache.py` (`Cache-Control`) e nas `service.py` de cada
feature, onde ficam os TTLs.

## Visão geral

1. A rota chama um service, que lê o cache do banco (Postgres) com `Sync.resolve`.
2. **Cache dentro do TTL**: responde na hora, sem tocar no SIGAA.
3. **Cache vencido**: responde na hora com o que tem e agenda um **job** no QStash para atualizar
   (_stale-while-revalidate_).
4. **Sem cache** (ou o cliente exigiu revalidar): busca no SIGAA **antes de responder**, com a sessão do
   próprio usuário.

Nada roda depois da resposta: os jobs são publicados no QStash antes dela. Cada job loga numa **sessão
própria** do SIGAA com a credencial cifrada, roda as tarefas e faz logout. A sessão do usuário nunca é
usada num job.

## TTLs

O TTL conta a partir do `synced_at` do dado e vence quando `idade > TTL` (estritamente maior). Sem TTL
(`None`), o dado **nunca vence** sozinho.

| Dado | TTL | Quem tem o `synced_at` | Observação |
| :--- | :--- | :--- | :--- |
| Perfil (`/me`) | 24 h | usuário | |
| Lista de turmas (`/classrooms`) | 72 h | usuário | Vale para todos os semestres |
| Participantes da turma | 24 h | turma | Turma de semestre passado: sem TTL |
| Estatísticas da turma | 24 h | turma | Turma de semestre passado: sem TTL |
| Frequência da turma | 24 h | vínculo usuário × turma | Turma de semestre passado: sem TTL |
| Lista de notícias da turma | 60 min | turma | Turma de semestre passado: sem TTL |
| Conteúdo de uma notícia | sem TTL | notícia | Gravado no primeiro acesso; só muda com `no-cache` |
| Cardápio do RU | 72 h | campus | Sem job: revalida na hora (veja abaixo) |

"Turma atual" é a que o SIGAA marca como do semestre vigente (`ClassroomUser.current`).

Dados **por turma** (participantes, estatísticas, notícias) são compartilhados entre os usuários: se outro
aluno da mesma turma sincronizou há pouco, o seu cache também está fresco. A frequência é por usuário.

## `Cache-Control` do cliente

O cliente só consegue ser **mais exigente** que o servidor, nunca menos: os TTLs acima continuam valendo.

| Diretiva | Efeito |
| :--- | :--- |
| _(nenhuma)_ | Segue só os TTLs do servidor |
| `no-cache` ou `max-age=0` | Busca no SIGAA antes de responder |
| `max-age=N` | Busca antes de responder se o cache tem N s ou mais. Um `N` maior que o TTL **não** impede a revalidação em segundo plano |
| `stale-if-error[=N]` | Se o SIGAA falhar, serve o cache (de até N s; sem valor, de qualquer idade) |
| `only-if-cached` | Nunca busca na hora. Sem cache → `504`. Com cache vencido, serve e **ainda agenda** o job |

Respostas com cache saem com `Cache-Control: private, no-cache` e `Age`. Rotas sem cache saem com
`no-store`.

## Quando a API sincroniza

### Na requisição (antes de responder)

- **Não há cache** do dado.
- O cliente pediu (`no-cache`, `max-age` vencido). Aqui a lista de turmas também regrava as turmas de
  semestres passados (`refresh`).
- Uma turma que **não está no cache** do usuário é pedida: a lista de turmas é relida na hora. Se mesmo
  assim a turma não aparece → `404`.
- Cardápio do RU vencido (ou intervalo pedido sem nenhum dia em cache).

Se a busca falhar e houver cache aceito pelo `stale-if-error`, ele é servido. Senão o erro sobe (`502`
para falha da origem).

### Em segundo plano (job no QStash)

- O dado foi servido **vencido** (idade > TTL): agenda a tarefa daquela turma, ou da conta.
- A lista de turmas está vencida ao abrir qualquer turma: agenda o sync da conta.
- **Login** (`POST /auth/sigaa`) e **refresh** (`POST /auth/sigaa/refresh`, chamado ao abrir o app):
  se o usuário não existe, ou perfil/lista de turmas/participantes/estatísticas estão vencidos, agenda o
  sync da conta. O job da conta atualiza perfil e lista de turmas vencidos e então agenda **um job por
  turma** com participantes ou estatísticas vencidos.

O login só pré-aquece perfil, turmas, participantes e estatísticas. Frequência e notícias só sincronizam
quando alguém as consulta.

Um job por turma leva todas as tarefas vencidas dela; tarefas repetidas na mesma requisição entram uma vez.
O job roda as tarefas **sem rechecar o TTL**.

## Quando a API **não** sincroniza

- **Cache dentro do TTL** e o cliente não pediu para revalidar.
- **Dado sem TTL**: conteúdo de notícia, e participantes, estatísticas, frequência e lista de notícias de
  turmas de semestres passados. Só são relidos com `no-cache`.
- **Regras do calendário acadêmico** (`api/academic_calendar.py`): passados 3 dias do fim do semestre
  da turma, os participantes vencem até um último sync. Depois dele, **nunca** são ressincronizados,
  nem com `no-cache` nem no login. Semestres anteriores ao calendário já contam como encerrados.
- **Turmas passadas na lista**: o job de fundo não regrava turmas de semestres passados que já existem
  (só um `refresh` do cliente faz isso).
- **`only-if-cached`**: nunca vai ao SIGAA na requisição (`504` sem cache).
- **Outro usuário sincronizou** a mesma turma há pouco: o `synced_at` compartilhado ainda está fresco.
- **Job duplicado**: o QStash descarta o mesmo job (mesma matrícula, turma e tarefas) publicado em até
  **10 min**. Pedidos seguidos de um dado vencido não geram uma fila de jobs.
- **Falha ao agendar**: se o QStash não responder em 3 s ou recusar, o erro é só logado e nenhum job
  existe; o dado segue vencido até o próximo acesso agendar de novo.
- **Senha recusada no job**: o job é descartado em silêncio (sem retentativa). Na requisição vira `401`
  e apaga os cookies.
- **Turma saiu da lista do usuário** depois de agendada: o job é descartado.
- **Turma ou notícia sumiu do SIGAA** (`ClassroomNotFound`, `NewsNotFound`) ou **gravação concorrente**
  (`IntegrityError`): a tarefa é descartada, sem retentativa.
- **Rotas sem cache**, que não sincronizam porque nada é guardado: `/me/ru-statement`, `/me/ru-token`,
  `/news` (home do SIGAA) e `/public/classrooms` sempre vão à origem; `/me/settings` só usa o banco.

## Falhas e retentativas

| Situação | Resultado |
| :--- | :--- |
| Origem falha (SIGAA/HTTP) no job | **1 retentativa**, após 60 s, só com as tarefas que falharam |
| Falha no login do job | Retenta o job inteiro uma vez |
| Falha de novo na retentativa | Desiste; o cache segue vencido até o próximo acesso |
| Requisição: origem falha, sem `stale-if-error` | Erro `502` (o cache não é usado) |
| Requisição: origem falha, com `stale-if-error` válido | Serve o cache |
| Gravação concorrente na requisição | Tenta gravar até 3 vezes; depois serve o que o outro sync gravou |
| Cache continua vazio após sincronizar | `503` ("Cache is being updated, try again") |

Os jobs de um mesmo usuário rodam no máximo **4 em paralelo** (`flow_control` do QStash), para poupar o
CAS.

## Cardápio do RU (sem job)

Não passa pelo `Sync`: o cardápio é público e vem do site da UnB, sem login.

- Cache por campus, TTL de 72 h. Vencido, o cardápio **inteiro** do campus é baixado e gravado na hora.
- Intervalo pedido sem nenhum dia em cache vai ao site mesmo com o campus fresco.
- Site fora do ar: se houver cache do intervalo, serve-o (TTL vencido) ou só com `stale-if-error`
  (se o cliente forçou a revalidação). Sem cache do intervalo → `502`.
- Erro ao ler ou gravar o cache no banco só é logado: a resposta sai do site.

## Cache no navegador

O front tem outra camada, independente: o TanStack Query persiste os dados da API por 14 dias para o modo
offline. Veja [offline.md](offline.md).
