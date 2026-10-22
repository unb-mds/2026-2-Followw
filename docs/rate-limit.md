# Redis e rate limit

A API usa os SDKs assíncronos oficiais do [Redis](https://upstash.com/docs/redis/sdks/py/gettingstarted)
e [rate limit](https://upstash.com/docs/redis/sdks/ratelimit-py/gettingstarted) da Upstash por HTTP,
compatíveis com a execução serverless na Vercel. `api/redis.py` cuida da conexão opcional;
`api/rate_limit.py` aplica a política antes das rotas, sem depender do banco ou do SIGAA.

Copie `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` do console da Upstash para o ambiente
da API. Sem qualquer uma delas, a API funciona sem Redis e sem limitação. Os padrões estão em
`api/core/config.py` e as variáveis em `.env.example`:

- `RATE_LIMIT_REQUESTS=120`: requisições por IP, compartilhadas entre as rotas.
- `RATE_LIMIT_LOGIN_REQUESTS=10`: cota separada para `POST /auth/sigaa`, incluindo tentativas inválidas.
- `RATE_LIMIT_WINDOW_SECONDS=60`: duração de cada janela fixa, em segundos.
- `REDIS_TIMEOUT_SECONDS=1`: espera máxima pelo Redis, sem retentativa.

As cotas são compartilhadas entre instâncias da API pelo Redis e separadas por ambiente.
Os contadores expiram automaticamente; as chaves usam o hash do IP, sem cookies ou credenciais.
Uma janela fixa permite rajadas na virada da janela. Pessoas na mesma rede compartilham a cota;
ajuste os limites conforme o tráfego observado, especialmente em redes da universidade.

O excesso retorna `429`, `Cache-Control: no-store` e `Retry-After` com os segundos até a próxima
janela. `OPTIONS`, `DELETE /auth/sigaa` e `POST /jobs` não consomem cota: sair sempre precisa apagar
a sessão, e o QStash já exige assinatura e controla o fluxo dos jobs.
Fora da Vercel, o IP vem de `request.client`; cabeçalhos enviados pelo usuário são ignorados.
Na Vercel (`VERCEL=1`, definido pela plataforma), usamos `X-Vercel-Forwarded-For`,
[sobrescrito pela plataforma](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for).
Em outra hospedagem com proxy, configure os proxies confiáveis no servidor ASGI.

No SSR e nas prévias do cardápio, o servidor web encaminha o IP original com HMAC-SHA256 e validade
de 60 segundos. A API verifica a assinatura antes de usar esse IP; cabeçalhos falsos, alterados ou
vencidos são ignorados. Assim, chamadas SSR e diretas do mesmo IP compartilham a cota, sem agrupar
todos os visitantes no IP de saída do servidor web. `JWT_SECRET_KEY` deve ter o mesmo valor no
ambiente dos servidores web e API, nunca em uma variável `VITE_`. A assinatura usa um prefixo
próprio, separado dos cookies; o segredo não vai para o navegador. Fora da Vercel, o servidor web
usa o endereço fornecido pelo runtime, sem confiar em `X-Forwarded-For` arbitrário. Sem segredo ou
endereço confiável no SSR, não há encaminhamento e a API usa o IP da conexão.

Falhas de rede, respostas inválidas ou timeout liberam a requisição (fail-open) e geram
`rate_limit.unavailable`, sem registrar token ou mensagens de erro. A falha desativa a proteção
daquela requisição; não derruba a API. O cliente Redis é fechado após cada consulta e não atravessa
event loops. Avisos e atestados de matrícula ficam fora desta integração.
