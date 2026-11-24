# Segurança das credenciais do SIGAA

O Followw não tem conta própria: você entra com a mesma matrícula e senha do SIGAA, e é o CAS da UnB
que confere se elas estão certas. Este documento explica como as credenciais são protegidas depois
do login e os limites dessa proteção. Todo o código citado é aberto e pode ser auditado.

## O Followw não guarda sua senha

Nenhuma senha vai para o banco de dados, para os logs ou para qualquer arquivo do servidor. O banco
guarda o cache acadêmico e os registros de autorização dos aplicativos.

Depois do login, a sessão fica com você, em dois cookies no seu navegador. A cada requisição, a API
decifra esses cookies em memória, usa o que precisa para falar com o SIGAA e descarta tudo ao
responder. A sessão por cookies é _stateless_.

As tarefas que rodam em segundo plano (sincronizar turmas, por exemplo) abrem uma sessão própria no
SIGAA, separada da sua, e a encerram ao terminar. Para isso cada tarefa leva a sua credencial
cifrada com uma chave que só a API conhece: o serviço de fila (Upstash QStash) guarda a mensagem até
entregá-la, mas só enxerga o conteúdo cifrado.

## Os dois cookies

| Cookie          | O que carrega            | Validade |
| --------------- | ------------------------ | -------- |
| `access_token`  | token de sessão do SIGAA | 40 min   |
| `refresh_token` | matrícula e senha        | 14 dias  |

A sessão do SIGAA expira rápido e não tem um mecanismo de renovação. Por isso o `refresh_token`
guarda a credencial: quando a sessão morre, a API faz login de novo no SIGAA por você, sem pedir a
senha outra vez.

Estes cookies recebem as seguintes configurações de segurança:

- `HttpOnly`: o JavaScript das páginas não consegue lê-los
- `Secure`: em produção, só trafegam em conexão segura (HTTPS)
- `SameSite=Lax`: restringe o envio dos cookies em requisições entre sites, mas permite, por
  exemplo, navegações de nível superior com métodos seguros; não elimina todos os riscos de CSRF.

## Os cookies são criptografados

Guardar a senha no navegador só é aceitável se ela estiver ilegível ali. Cada cookie é um JWE: o
conteúdo inteiro, inclusive a data de expiração, é cifrado com AES-256-GCM. Quem abrir o cookie vê
apenas bytes aleatórios. Somente o servidor tem a chave para decifrá-lo e enviar corretamente para o
SIGAA.

## Uma chave para cada cookie

Os cookies e os jobs usam `JWT_SECRET_KEY`, com no mínimo 32 caracteres. Ele nunca é usado
diretamente: a partir dele são derivadas chaves de 256 bits, uma para cada uso: o `access_token`, o
`refresh_token` e as tarefas em segundo plano.

Na prática:

- um cookie não pode ser usado no lugar do outro, porque a chave de um não decifra o outro;
- descobrir uma das chaves derivadas não revela o segredo nem as outras chaves;
- trocar o segredo invalida de uma vez todos os cookies já emitidos.

## Tokens OAuth de aplicações

O cadastro em `/oauth/applications` exige a sessão web do desenvolvedor. Cada aplicação tem um
`client_id`, pertence ao login SIGAA que a criou e registra suas URIs de retorno. A API retorna o
segredo aleatório de 256 bits na criação e na rotação e guarda somente seu hash SHA-256. Remover
a aplicação revoga as concessões já emitidas.

A tela de consentimento consulta `GET /oauth/authorize` com `response_type=code`, `client_id`,
`redirect_uri`, os escopos em `scope` e o desafio PKCE com `code_challenge_method=S256`. O
`POST /oauth/authorize` recebe `request_token` e `approved` e devolve a URI validada com o código
ou `error=access_denied`, junto do `state` quando informado. A API compara a URI exatamente com a
cadastrada e aceita HTTPS ou HTTP de loopback.

A aplicação troca o código em `POST /oauth/token` com `grant_type=authorization_code`, `code`,
`redirect_uri` e `code_verifier`. Autentica-se por HTTP Basic ou pelos campos `client_id` e
`client_secret` no formulário. O código vence em cinco minutos e só pode ser trocado uma vez.

Cada autorização tem um registro com matrícula, aplicação, permissões concedidas, salt aleatório e
vencimento. A API deriva chaves distintas para access e refresh com HKDF, o salt e
`OAUTH_SECRET_KEY`. A senha do SIGAA fica cifrada no token do cliente. Cada chamada Bearer valida a
autorização antes de servir o cache. Excluir o registro invalida imediatamente os dois tokens.

O access vale 40 minutos. Na renovação, a API autentica no SIGAA, cifra a nova sessão no access e
agenda o sync da conta, como o refresh da web. A autorização é conferida novamente após o login. O
sucesso estende por 14 dias o prazo do mesmo refresh. Em `POST /oauth/token`, a renovação recebe
`grant_type=refresh_token` e `refresh_token`. Aplicações cadastradas apresentam o segredo atual.
Concessões públicas exigem `client_id` e uma prova DPoP ES256 nova, vinculada à chave da instalação
e à URL `PUBLIC_URL/oauth/token`. Clientes no navegador usam `credentials: "omit"`.

No OpenAPI, `x-oauth-scopes` traz o título, o nível de confiança e as dependências de cada
permissão. O nível informa a sensibilidade do acesso. Cada operação delegável declara seu
`x-oauth-scope`. As respostas OAuth contêm apenas os campos concedidos. O perfil básico inclui nome,
matrícula, foto e curso. `grades:read` acrescenta IRA, MP e menções nas turmas autorizadas. A agenda
omite presença e marcação sem `classrooms.frequency:read`. Consultar uma turma passada por ID também
exige `classrooms.history:read`.

## Se o seu navegador for comprometido

Quem copiar os cookies pode usá-los para acessar sua conta no Followw enquanto forem válidos. Sem a
chave do servidor, o conteúdo cifrado não revela diretamente a matrícula nem a senha; um navegador
ou dispositivo comprometido também pode expor dados por outros meios.

## Padrões utilizados

- **JWE**: [RFC 7516](https://www.rfc-editor.org/rfc/rfc7516), no formato compacto, carregando um
  **JWT** ([RFC 7519](https://www.rfc-editor.org/rfc/rfc7519)) com uma data de expiração
  obrigatória.
- `dir` **+** `A256GCM`: algoritmos da [RFC 7518](https://www.rfc-editor.org/rfc/rfc7518).
  Criptografia simétrica direta com AES-256 no modo GCM
  ([NIST SP 800-38D](https://csrc.nist.gov/pubs/sp/800/38/d/final)), com IV aleatório de 96 bits a
  cada cookie emitido.
- **HKDF-SHA256**: [RFC 5869](https://www.rfc-editor.org/rfc/rfc5869), para derivar as chaves.
- **Fernet**: para as tarefas em segundo plano, que levam a credencial (AES-128-CBC com
  HMAC-SHA256).
- **Cookies** `HttpOnly`**,** `Secure` **e** `SameSite`:
  [RFC 6265](https://www.rfc-editor.org/rfc/rfc6265) e extensões.

As implementações vêm de bibliotecas mantidas e amplamente usadas
([joserfc](https://jose.authlib.org/) e [cryptography](https://cryptography.io/)). O Followw não
implementa nenhum algoritmo criptográfico por conta própria.

## Onde conferir

- `apps/api/api/cookies.py`: derivação das chaves, emissão, criptografia e leitura dos cookies.
- `apps/api/tests/test_cookies.py`: testes de segurança de cada etapa (vazamento, adulteração,
  chaves, formatos recusados, expiração).
- `apps/api/api/sync/queue.py`: cifra das tarefas em segundo plano.
