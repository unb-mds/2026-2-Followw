# Followw na Oracle Cloud

## Instância em São Paulo

1. Crie `vm-followw` em `vcn-followw` / `subnet-publica-followw`. Para usar a franquia Always Free, confirme que São Paulo é a região principal da conta e escolha `VM.Standard.A1.Flex` com até 2 OCPUs e 12 GB de RAM no total disponível da conta. Um volume de inicialização de 50 GB conta na franquia compartilhada de 200 GB.
2. Use uma imagem Linux compatível com ARM64. Gere um par de chaves SSH em cada computador de administração e autorize as chaves públicas de todos na VM. Mantenha a chave privada no computador de origem.
3. Na interface da VM, associe `ip-publico-followw` (`137.131.193.208`) ao IPv4 privado primário. Se o assistente tiver criado um IPv4 público efêmero, desassocie-o primeiro.

## Firewall da VM

- A lista `seguranca-followw`, associada à sub-rede, permite saída IPv4 e não tem regras de entrada.
- Associe `nsg-web-followw` à interface primária da VM no OCI. O acesso web usa duas regras de entrada com estado, `80/TCP` e `443/TCP`, com origem IPv4 `0.0.0.0/0`.
- Para SSH, crie o grupo `nsg-ssh-followw` e associe-o à interface primária da VM. Adicione uma regra de entrada com estado para `22/TCP` por IPv4 público de administração, usando `/32` em cada origem. Computadores que saem pelo mesmo IPv4 público compartilham a regra. Atualize a origem quando esse IP mudar.
- Teste o SSH de cada rede de administração antes de encerrar a sessão atual. Para retirar o acesso de um computador, remova a chave pública correspondente de `~/.ssh/authorized_keys` na VM.
- Na VM, confira se o firewall permite HTTP, HTTPS e o SSH restrito. O Docker aplica as próprias regras ao publicar portas. Verifique as portas publicadas com `docker compose ps` e mantenha o controle de acesso externo no OCI. [Docker e firewalls](https://docs.docker.com/engine/network/packet-filtering-firewalls/)

## Subir os serviços

Instale Docker com Compose v2 na VM e clone o repositório com estes arquivos. Na raiz:

```sh
cp deploy/oci/.env.example deploy/oci/.env
chmod 600 deploy/oci/.env
```

Preencha `deploy/oci/.env`. Use `openssl rand -hex 32` duas vezes para gerar senhas distintas para `POSTGRES_PASSWORD` (administração) e `POSTGRES_APP_PASSWORD` (API). Preencha também as credenciais do QStash e do Upstash Redis REST. Reutilize `JWT_SECRET_KEY` e `RATE_LIMIT_SECRET_KEY` da implantação atual para preservar sessões, jobs pendentes e a assinatura do IP no SSR. Em uma instalação nova, gere cada chave separadamente com o mesmo comando. O PostHog é opcional e usa as variáveis `VITE_POSTHOG_*` no build.

O Compose cria um PostgreSQL local. Para migrar a produção, execute primeiro o procedimento da seção **Migrar dados** e volte a este bloco depois de restaurar o banco. Para uma instalação nova, comece por aqui. `db-prepare` provisiona o usuário restrito da API. `db-init` cria tabelas ausentes e carrega os dados de referência.

```sh
cd deploy/oci
docker compose config --quiet
docker compose up -d --build
docker compose ps -a
docker compose logs db-prepare db-init api web caddy
```

Para carregar o catálogo público de docentes em uma instalação nova, obtenha o `professors.csv` com SIAPE usando `packages/sigaa-client/scripts/collect_professors.py` e importe-o. Em uma migração, confirme no banco restaurado que o catálogo foi preservado.

```sh
docker compose run --rm --no-deps -T -v "$(realpath professors.csv):/tmp/professors.csv:ro" \
  db-init db-seed-professors /tmp/professors.csv
```

O Caddy publica somente `80/TCP` e `443/TCP` em IPv4. A API, o SSR e o PostgreSQL usam a rede interna do Compose. O QStash chama `https://api.followw.app/jobs` e a API verifica a assinatura do webhook.

## Migrar dados

1. Ensaie em um projeto Compose separado com uma cópia do banco. Use a revisão que vai subir na VM. Restaure em um banco vazio e rode a inicialização. Se a cópia tiver diferenças de schema, ajuste-as no ensaio e repita com uma cópia limpa. Confira preferências, marcações de presença e o catálogo de docentes.
2. Para a cópia final, coloque a instalação antiga em manutenção, incluindo `/jobs` com HTTP 503 para permitir novas tentativas do QStash. Espere gravações e jobs em andamento terminarem. Mantenha a instalação antiga em manutenção enquanto o DNS propaga, para que as duas instalações não gravem em bancos diferentes.
3. Use `pg_dump --format=custom --no-owner --no-privileges` com um cliente compatível com o PostgreSQL de origem. Transfira a cópia por um canal seguro, guarde-a fora do repositório com permissões restritas e restaure no banco vazio da VM. No diretório `deploy/oci`:

   ```sh
   docker compose up -d --wait db
   docker compose exec -T db pg_restore -U followw -d followw \
     --single-transaction --exit-on-error --no-owner --no-privileges < "$FOLLOWW_MIGRATION_DUMP"
   ```

4. Suba os serviços, confirme os dados restaurados e siga para a verificação do domínio. Se precisar voltar depois que o OCI tiver aceitado gravações, preserve e reconcilie essas mudanças antes de reabrir a origem.

## Backup do PostgreSQL

Antes da virada, agende uma cópia diária criptografada fora da VM, em armazenamento da equipe com acesso restrito. No exemplo em Bash, `FOLLOWW_BACKUP_DIR` é um diretório de saída fora do checkout e `FOLLOWW_BACKUP_RECIPIENT` é a impressão digital da chave pública já importada no GPG. Execute no diretório `deploy/oci`:

```bash
set -euo pipefail
umask 077
arquivo="$FOLLOWW_BACKUP_DIR/followw-$(date -u +%Y%m%dT%H%M%SZ).dump.gpg"
docker compose exec -T db pg_dump -U followw -Fc --no-owner --no-privileges followw |
  gpg --batch --trust-model always --recipient "$FOLLOWW_BACKUP_RECIPIENT" --encrypt --output "$arquivo.partial"
mv -T "$arquivo.partial" "$arquivo"
```

Transfira o arquivo final ao destino da equipe e monitore falhas de geração ou envio. Guarde a chave privada de recuperação fora da VM. Teste a restauração a partir de uma cópia recuperada desse destino. Use `gpg --decrypt` e encaminhe o resultado para `pg_restore` com os parâmetros acima em um banco de teste vazio. Uma rotina diária pode perder até um dia de alterações entre cópias bem-sucedidas.

## Domínio e verificação

Quando o frontend e a API estiverem prontos na VM, atualize os registros de `followw.app`, `api.followw.app` e `www.followw.app` na Cloudflare para registros `A` com `137.131.193.208`, em modo **Somente DNS**. Substitua registros antigos conflitantes desses nomes. O Caddy recebe o IP do visitante, emite certificados e redireciona `www` para `followw.app`.

```sh
ip=137.131.193.208
curl -sSI --resolve "followw.app:80:$ip" http://followw.app/login
curl -fsS --resolve "followw.app:443:$ip" -o /dev/null https://followw.app/login
curl -fsS --resolve "followw.app:443:$ip" 'https://followw.app/api/public/subjects?code=MAT0025'
curl -fsS --resolve "api.followw.app:443:$ip" -o /dev/null https://api.followw.app/openapi.json
curl -sSI --resolve "www.followw.app:443:$ip" https://www.followw.app/login
```

Rode as verificações HTTPS depois de o Caddy emitir os certificados. Confira os redirecionamentos e se a busca retorna a matéria `MAT0025`. Abra o site, faça login no SIGAA, teste as preferências e confirme que o QStash entregou um job à nova API. Revise as entregas que falharam durante a manutenção.
