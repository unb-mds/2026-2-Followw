# Observabilidade

## Logs da API

A API emite um JSON por linha em stderr, pelo logger `followw`. Cada requisição recebe um
`request_id` gerado internamente, compartilhado por seus eventos.

- `request.started` / `request.completed`: método, rota parametrizada, status e duração.
- `sigaa.connect.*` / `sigaa.logout.*`: abertura e encerramento da sessão do SIGAA.
- `queue.publish.*`: publicação e quantidade de jobs.
- `job.*`: tentativa, quantidade de etapas e resultado da execução.
- `sync.task.*`: início, fim ou falha de cada tarefa, incluindo as subtarefas da conta.

Eventos de conclusão e falha de operações incluem `duration_ms`, o tempo decorrido (inclui espera de
rede e banco; não é uma medição de CPU). Falhas incluem somente `error_type`. Um job pode terminar
normalmente com etapas que falharam: `job.result.failed_count` informa isso, e
`sync.task.retry_pending` identifica a etapa. Cada entrega de job tem seu próprio `request_id`.

O módulo `api/logger.py` aceita apenas metadados operacionais definidos em sua lista de campos. Não
passe valores sensíveis nos campos permitidos: os nomes de eventos e tarefas são constantes do
código. Cookies, cabeçalhos, corpos, parâmetros de URL, credenciais, objetos de job e
mensagens/tracebacks de exceções não são registrados.

## Home e cardápio do RU

Os documentos de `/` e `/ru` expõem `Server-Timing`. `ssr` mede o servidor até preparar a
resposta; `me` e `menu` medem a espera pelos cabeçalhos da API quando cada consulta ocorre. Uma
home sem sessão não faz essas consultas antes de responder.

Comparação local da home sem login durante a #209, antes do ajuste de precache. As medianas são
de três navegações em Chrome, viewport 390 × 844, CPU 4× mais lenta, rede a 1,6 Mbps com 80 ms de
latência, cache HTTP desativado e API simulada.

| Medição | Antes | Depois |
| --- | ---: | ---: |
| TTFB | 184 ms | 82 ms |
| LCP | 736 ms | 576 ms |
| CLS | 0 | 0 |
| JavaScript da navegação | 587,4 KiB | 325,5 KiB |
| CSS da navegação | 20,9 KiB | 20,8 KiB |

Antecipar a fonte elevou o LCP mediano para 776 ms. Separar os módulos do painel Hoje, postagens
e gráficos reduziu a instalação anônima do precache de 684 para 553 KiB com gzip. O teste
reabriu a home, o RU e a busca interativa offline como visitante, além do painel Hoje com uma
sessão simulada. O manifesto da PWA e o ícone só são baixados novamente pelo service worker
quando mudam de conteúdo.

Depois de publicar, use a [inspeção de URL do Search Console][recrawl] para solicitar o
rastreamento de `/` e `/ru`. Acompanhe impressões e cliques de consultas de marca e cardápio.
No celular, acompanhe as metas de campo no p75: LCP ≤ 2,5 s, INP ≤ 200 ms e CLS ≤ 0,1. No PostHog,
use a atribuição de INP no evento `$web_vitals` para identificar quais interações demoram antes de
decidir se vale dividir o bundle principal.

[recrawl]: https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
