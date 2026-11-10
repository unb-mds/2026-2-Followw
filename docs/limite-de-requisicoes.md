# Redis e rate limit

A API usa os SDKs assíncronos da Upstash para
[Redis](https://upstash.com/docs/redis/sdks/py/gettingstarted) e
[rate limit](https://upstash.com/docs/redis/sdks/ratelimit-py/gettingstarted), via HTTP, compatíveis
com a Vercel. `api/redis.py` cuida da conexão opcional e `api/rate_limit.py` aplica a política antes
das rotas.

Configure `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` (obrigatórios para o rate limit). Os
padrões ficam em `api/core/config.py` e `.env.example`:

- `RATE_LIMIT_REQUESTS=600`: cota geral por IP.
- `RATE_LIMIT_LOGIN_REQUESTS=30`: cota de `POST /auth/sigaa` por IP.
- `RATE_LIMIT_REFRESH_REQUESTS=120`: cota separada de `POST /auth/sigaa/refresh`. Ao exceder, o sync
  não é agendado, mas ninguém é deslogado.
- `RATE_LIMIT_WINDOW_SECONDS=60`: janela fixa das cotas acima.
- `RATE_LIMIT_REGISTRATION_REQUESTS=10` e `RATE_LIMIT_REGISTRATION_WINDOW_SECONDS=600`: tentativas
  de login por matrícula, de qualquer IP. A desvantagem é a possibilidade de impedir um login
  legítimo de uma matrícula por 10 minutos. Veja a
  [ADR 0001](adr/0001-limite-de-login-por-matricula.md).
- `RATE_LIMIT_SECRET_KEY`: assina o IP encaminhado pelo SSR.
- `REDIS_TIMEOUT_SECONDS=1`: espera máxima pelo Redis, sem retentativa.

As cotas são compartilhadas entre instâncias e separadas por ambiente. As chaves são um HMAC do IP
(ou da matrícula) derivado de `JWT_SECRET_KEY`. Endereços IPv6 são agrupados por prefixo `/64`.
Nenhum dado pessoal, cookie ou credencial é gravado no Redis. Os padrões consideram redes da UnB
atrás de NAT e evitam que os IPs de saída do Followw sejam bloqueados pela universidade.

O excesso retorna `429` com `Cache-Control: no-store` e `Retry-After`. `OPTIONS` e `POST /jobs`
(assinado pelo QStash) não consomem cota. Com a cota esgotada, `DELETE /auth/sigaa` ainda apaga os
cookies, só pula o logout no SIGAA.

O IP vem de `request.client` ou, na Vercel, de
[`X-Vercel-Forwarded-For`](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for).
No SSR, o servidor web encaminha o IP original assinado com HMAC-SHA256 (validade de 60 s), e a API
ignora assinaturas inválidas ou vencidas. O `RATE_LIMIT_SECRET_KEY` deve ser igual na web e na API.

Falhas ou timeout do Redis liberam a requisição (fail-open) e geram o log `rate_limit.unavailable`.
