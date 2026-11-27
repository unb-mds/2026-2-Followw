# Followw na Oracle Cloud

Ambiente independente em **oracle.followw.app**, com a API em **oracle.followw.app/api**. O frontend, a API, o PostgreSQL, o Redis e a fila rodam na Oracle. `followw.app`, `api.followw.app`, `docs.followw.app` e `t.followw.app` continuam na implantação atual.

## Instância em São Paulo

1. Crie a `vm-followw` em `vcn-followw` / `subnet-publica-followw` e use uma imagem ARM64. Para a franquia Always Free, confirme que São Paulo é a região principal da conta.
2. Associe o IPv4 público reservado `137.131.193.208` à interface primária da VM.
3. Associe o `nsg-web-followw` à interface. Use entradas com estado de `0.0.0.0/0` para `80/TCP` e `443/TCP`. Adicione `443/UDP` para HTTP/3 direto na VM. Para SSH, use um NSG separado e limite `22/TCP` ao IPv4 `/32` de cada rede administrativa.
4. Use um registro `A` para `oracle.followw.app` com o IP reservado. Com o proxy Cloudflare, use SSL **Full (strict)** e um certificado válido para o domínio na VM.

## Implantar pelo Coolify

Clone a branch `oracle-cloud-deploy` na VM e prepare as dependências persistentes.

```sh
cd deploy/oci
cp -n .env.example .env
chmod 600 .env
```

Preencha as duas senhas do PostgreSQL e os quatro segredos da aplicação e do Redis REST no `.env`. Gere cada valor com `openssl rand -hex 32`. Em uma VM que já roda o preview, mantenha o volume `followw-preview_postgres-followw` e reutilize a senha de cada conta e as chaves já usadas pelo ambiente. As credenciais predefinidas da fila são do QStash local.

```sh
docker compose up -d db-prepare redis-http qstash
docker compose ps -a
docker compose logs db-prepare
```

Depois que `db-prepare` sair com código zero, configure o recurso **Followw Oracle Preview** em modo Raw com `deploy/oci/compose.coolify.yml` na mesma branch. Configure nele os mesmos valores de `POSTGRES_PASSWORD`, `POSTGRES_APP_PASSWORD`, `JWT_SECRET_KEY`, `OAUTH_SECRET_KEY`, `RATE_LIMIT_SECRET_KEY`, `UPSTASH_REDIS_REST_TOKEN` e das três variáveis `QSTASH_*`. Ative `FOLLOWW_COOLIFY_ROUTE=true` para publicar o preview. `db-init` cria tabelas e carrega os dados de referência.

O QStash local entrega jobs diretamente ao contêiner da API. `/api/jobs` retorna 404 na borda pública. Redis, QStash e PostgreSQL ficam sem portas publicadas. A fila local roda em memória e perde pendências em caso de reinício.

## Proxy, deploy e verificação

O Traefik termina TLS e usa HTTP/2 sem TLS (`h2c`) até o frontend e a API. Mantenha a configuração padrão de cabeçalhos encaminhados do Traefik. A aplicação usa `CF-Connecting-IP` apenas quando o último IP encaminhado está na lista da Cloudflare. Atualize `cloudflare-cidrs.txt` quando as [faixas oficiais](https://www.cloudflare.com/ips/) mudarem.

Com o proxy da Cloudflare, o navegador pode usar HTTP/3 até a Cloudflare e ela pode usar HTTP/2 até o Traefik. Para testar HTTP/3 direto, confirme `443:443/udp` e `--entrypoints.https.http3` no proxy do Coolify e `443/UDP` no NSG. Use `curl --http3-only --resolve oracle.followw.app:443:137.131.193.208 https://oracle.followw.app/login` em um cliente com suporte a QUIC.

O CI da branch envia o commit aprovado ao webhook do Coolify. O Traefik encaminha `POST /_ops/followw-deploy` a `/webhooks/source/github/events/manual`. O segredo `FOLLOWW_OCI_WEBHOOK_SECRET` no GitHub Actions deve coincidir com o segredo do webhook no recurso. O CI confere `X-Followw-Revision` no frontend e na API.

```sh
curl -fsSI https://oracle.followw.app/login
curl -fsS 'https://oracle.followw.app/api/public/subjects?code=MAT0025'
docker compose logs redis-http qstash
```

Para verificar uma entrega real, entre com uma conta de teste do SIGAA e confira o evento `job.result` nos logs da API do Coolify.

## Dados do preview

Para carregar o catálogo público de docentes em uma instalação nova, obtenha o `professors.csv` com SIAPE usando `packages/sigaa-client/scripts/collect_professors.py` e importe-o depois que o Coolify concluir a inicialização do banco.

```sh
docker compose run --rm --no-deps -T -v "$(realpath professors.csv):/tmp/professors.csv:ro" \
  db-init db-seed-professors /tmp/professors.csv
```

Guarde uma cópia do PostgreSQL criptografada fora da VM. No exemplo em Bash, `FOLLOWW_BACKUP_DIR` é um diretório fora do checkout e `FOLLOWW_BACKUP_RECIPIENT` é a impressão digital da chave pública já importada no GPG.

```bash
set -euo pipefail
umask 077
arquivo="$FOLLOWW_BACKUP_DIR/followw-oracle-$(date -u +%Y%m%dT%H%M%SZ).dump.gpg"
docker compose exec -T db pg_dump -U followw -Fc --no-owner --no-privileges followw |
  gpg --batch --trust-model always --recipient "$FOLLOWW_BACKUP_RECIPIENT" --encrypt --output "$arquivo.partial"
mv -T "$arquivo.partial" "$arquivo"
```

Teste a restauração a partir de uma cópia recuperada desse destino. Use `gpg --decrypt` e encaminhe o resultado para `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges` em um banco de teste vazio.

## Teste sem Coolify

Em uma máquina sem Traefik nas portas 80 e 443, o mesmo Compose também sobe um Caddy para o preview. Use `docker compose up -d --build` com o `.env` já preenchido. Na VM do Coolify, o Traefik é o proxy público.
