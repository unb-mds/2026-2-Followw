# Logs da API

A API emite um JSON por linha em stderr, pelo logger `followw`. Cada requisição
recebe um `request_id` gerado internamente, compartilhado por seus eventos.

- `request.started` / `request.completed`: método, rota parametrizada, status e duração.
- `sigaa.connect.*` / `sigaa.logout.*`: abertura e encerramento da sessão do SIGAA.
- `queue.publish.*`: publicação e quantidade de jobs.
- `job.*`: tentativa, quantidade de etapas e resultado da execução.
- `sync.task.*`: início, fim ou falha de cada tarefa, incluindo as subtarefas da conta.

Eventos de conclusão e falha de operações incluem `duration_ms`, o tempo decorrido
(inclui espera de rede e banco; não é uma medição de CPU). Falhas incluem somente
`error_type`. Um job pode terminar normalmente com etapas que falharam:
`job.result.failed_count` informa isso, e `sync.task.retry_pending` identifica a etapa.
Cada entrega de job tem seu próprio `request_id`.

O módulo `api/logger.py` aceita apenas metadados operacionais definidos em sua lista
de campos. Não passe valores sensíveis nos campos permitidos: os nomes de eventos
e tarefas são constantes do código. Cookies, cabeçalhos, corpos, parâmetros de URL,
credenciais, objetos de job e mensagens/tracebacks de exceções não são registrados.

# Primeiro acesso

`users.registered_at` guarda o primeiro login/refresh autenticado no Followw, em UTC,
antes da publicação do sync. Novos logins, atualizações de perfil e refreshes preservam
essa data. Usuários importados como participantes permanecem com o campo nulo até
acessarem o aplicativo.

Conforme a política do projeto, não há migration: `db-init` não adiciona colunas em
tabelas existentes. A nova coluna exige recriar o banco no processo de atualização.
