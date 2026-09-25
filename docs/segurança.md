# Segurança das credenciais do SIGAA

O Followw não tem conta própria: você entra com a mesma matrícula e senha do
SIGAA, e é o CAS da UnB que confere se elas estão certas. Este documento
explica o que acontece com essas credenciais depois do login e por que elas não
ficam expostas nem no nosso servidor nem no seu navegador. Todo o código citado
é aberto e pode ser auditado.

## O Followw não guarda sua senha

Nenhuma senha vai para o banco de dados, para os logs ou para qualquer arquivo
do servidor. O banco guarda só os dados acadêmicos que o SIGAA já mostra (perfil,
turmas, participantes), usados como cache.

Depois do login, a sessão fica com você, em dois cookies no seu navegador. A cada
requisição, a API decifra esses cookies em memória, usa o que precisa para falar
com o SIGAA e descarta tudo ao responder. A API é _stateless_, ou seja, ela nunca
mantém uma sessão ativa.

As tarefas que rodam em segundo plano (sincronizar turmas, por exemplo) recebem
só o token de sessão do SIGAA, nunca a senha, e ele também viaja protegido.

## Os dois cookies

| Cookie          | O que carrega            | Validade |
| --------------- | ------------------------ | -------- |
| `access_token`  | token de sessão do SIGAA | 40 min   |
| `refresh_token` | matrícula e senha        | 14 dias  |

A sessão do SIGAA expira rápido e não tem um mecanismo de renovação. Por isso o
`refresh_token` guarda a credencial: quando a sessão morre, a API faz login de
novo no SIGAA por você, sem pedir a senha outra vez.

Estes cookies recebem as seguintes configurações de segurança:

- `HttpOnly`: o JavaScript das páginas não consegue lê-los
- `Secure`: em produção, só trafegam em conexão segura (HTTPS)
- `SameSite=Lax`: outros sites não conseguem usar o Followw com seu login.

## Os cookies são criptografados

Guardar a senha no navegador só é aceitável se ela estiver ilegível ali.
Cada cookie é um JWE: o conteúdo inteiro, inclusive a data de expiração, é
cifrado com AES-256-GCM. Quem abrir o cookie vê apenas bytes aleatórios.
Somente o servidor tem a chave para decifrá-lo e enviar corretamente para o SIGAA.

## Uma chave para cada cookie

Existe um único segredo configurado no servidor (`JWT_SECRET_KEY`, com no mínimo
32 caracteres). Ele nunca é usado diretamente: a partir dele são derivadas três
chaves de 256 bits, uma para cada uso: o `access_token`, o `refresh_token` e as
tarefas em segundo plano.

Na prática:

- um cookie não pode ser usado no lugar do outro, porque a chave de um não
  decifra o outro;
- descobrir uma das chaves derivadas não revela o segredo nem as outras chaves;
- trocar o segredo invalida de uma vez todos os cookies já emitidos.

## Se o seu navegador for comprometido

Se alguém copiar seus cookies (por um malware ou acesso ao seu computador), essa
pessoa **não descobre a sua senha nem sua matrícula**. Estes cookies só
possibilitam o acesso através do próprio Followw.

## Padrões utilizados

- **JWE**: [RFC 7516](https://www.rfc-editor.org/rfc/rfc7516), no formato
  compacto, carregando um **JWT** ([RFC 7519](https://www.rfc-editor.org/rfc/rfc7519))
  com uma data de expiração obrigatória.
- `dir` **+** `A256GCM`: algoritmos da
  [RFC 7518](https://www.rfc-editor.org/rfc/rfc7518). Criptografia simétrica
  direta com AES-256 no modo GCM
  ([NIST SP 800-38D](https://csrc.nist.gov/pubs/sp/800/38/d/final)), com IV
  aleatório de 96 bits a cada cookie emitido.
- **HKDF-SHA256**: [RFC 5869](https://www.rfc-editor.org/rfc/rfc5869), para
  derivar as chaves.
- **Fernet**: para os tokens das tarefas em segundo plano (AES-128-CBC com
  HMAC-SHA256).
- **Cookies** `HttpOnly`**,** `Secure` **e** `SameSite`:
  [RFC 6265](https://www.rfc-editor.org/rfc/rfc6265) e extensões.

As implementações vêm de bibliotecas mantidas e amplamente usadas
([joserfc](https://jose.authlib.org/) e
[cryptography](https://cryptography.io/)). O Followw não implementa nenhum
algoritmo criptográfico por conta própria.

## Onde conferir

- `apps/api/api/utils/session.py`: derivação das chaves, emissão, criptografia e
  leitura dos cookies.
- `apps/api/tests/test_session.py`: testes de segurança de cada etapa
  (vazamento, adulteração, chaves, formatos recusados, expiração).
- `apps/api/api/dependencies/qstash.py`: cifra das tarefas em segundo plano.
