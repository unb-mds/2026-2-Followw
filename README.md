# Followw UnB

O Followw é um client alternativo e open-source para o SIGAA da UnB. Ele reúne
numa experiência só as informações que hoje ficam espalhadas em sistemas
diferentes (SIGAA, RU, calendário, etc.), com cache para deixar tudo mais
rápido do que no SIGAA.

Não existe conta própria: o login é feito com a matrícula e senha do SIGAA,
pelo CAS da UnB. Suas credenciais ficam sempre no seu navegador e nunca são
guardadas no nosso servidor.

> O Followw UnB é um projeto independente, sem qualquer vínculo oficial com a UnB ou com o SIGAA. Parte do trabalho envolve o estudo do comportamento de sistemas legados e não documentados oficialmente, com fins educacionais e de melhoria da experiência dos próprios alunos que optarem por usar o projeto. O uso do Followw UnB é de responsabilidade de cada usuário.

## Estrutura

```
apps/
  api/              # API em FastAPI
  web/              # front-end em TanStack Start
packages/
  sigaa-client/     # biblioteca async que fala com o SIGAA
  unb-browser/      # biblioteca async dos sites públicos da UnB (RU, calendário, editais)
docs/               # requisitos, arquitetura e notas de sprint
```

## Como executar

### Pré-requisitos

- [Python 3.14+](https://www.python.org/) e [uv](https://docs.astral.sh/uv/)
- [Bun](https://bun.sh/)
- [Docker](https://www.docker.com/) (para o Postgres local)

### API

```sh
uv sync                           # instala as dependências do workspace
docker compose up -d db           # sobe o Postgres local

cd apps/api
cp .env.example .env              # preencha JWT_SECRET_KEY (openssl rand -base64 32)

# QStash local (fila dos jobs de sincronização), em outro terminal.
# Copie o token e as signing keys exibidos para o .env.
bunx --allow-scripts=@upstash/qstash-cli @upstash/qstash-cli dev

uv run db-init                    # cria as tabelas
uv run api                        # sobe a API em http://localhost:8000
```

A documentação interativa fica em `http://localhost:8000/docs`.

Recursos públicos, consultáveis sem login, usam o prefixo `/public`:

- `GET /public/restaurant`: cardápio do RU, com os filtros `campus`, `date`,
  `start_date`, `end_date`, `meal` e `refresh`. Substitui `/restaurant/menu`,
  preservando o comportamento do cache.
- `GET /public/classrooms`: busca pública de turmas por unidade, semestre,
  disciplina/professor (`contains`) e local.
- `GET /public/classrooms/units`: unidades disponíveis na busca pública.

Extrato/saldo e token exigem autenticação e ficam em `GET /me/ru-statement`
e `GET /me/ru-token`, substituindo `/restaurant/statement` e `/restaurant/token`.
`/classrooms` lista somente turmas do usuário
autenticado, sem lógica de busca pública. Rotas de autenticação, documentação
e callbacks mantêm seus caminhos próprios.

Na documentação, a categoria **Public** reúne **Classrooms** e **Restaurant**.

### Web

Com a API rodando:

```sh
cd apps/web
bun install
bun dev                           # sobe o front em http://localhost:3000
```

O front usa `http://localhost:8000` como API por padrão; para outra URL, defina
`VITE_API_URL`.

### Testes e lint

```sh
uv run pytest                     # testes de todos os apps e pacotes Python
uv run ruff check .
uv run ruff format .

cd apps/web && bun check          # formatação e lint do front
```

## Criadores

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/eliabexp">
        <img src="https://avatars.githubusercontent.com/u/74092305?v=4" width="100px;" alt="Foto de eliabexp no GitHub"/><br>
        <sub><b>eliabe</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/SamukaToned">
        <img src="https://avatars.githubusercontent.com/u/206484421?v=4" width="100px;" alt="Foto de SamukaToned no GitHub"/><br>
        <sub><b>Samuka</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/diegolxxz">
        <img src="https://avatars.githubusercontent.com/u/53051266?v=4" width="100px;" alt="Foto de diegolxxz no GitHub"/><br>
        <sub><b>Diego Godoi Rodrigues</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/Mendezalv">
        <img src="https://avatars.githubusercontent.com/u/198409500?v=4" width="100px;" alt="Foto de Mendezalv no GitHub"/><br>
        <sub><b>Kauã</b></sub>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://github.com/ed9gaspar">
        <img src="https://avatars.githubusercontent.com/u/316572409?v=4" width="100px;" alt="Foto de ed9gaspar no GitHub"/><br>
        <sub><b>Gaspar</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/gabrielcrzojo">
        <img src="https://avatars.githubusercontent.com/u/178046568?v=4" width="100px;" alt="Foto de gabrielcrzojo no GitHub"/><br>
        <sub><b>Gabriel</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/ratatta-na-nite">
        <img src="https://avatars.githubusercontent.com/u/210179065?v=4" width="100px;" alt="Foto de ratatta-na-nite no GitHub"/><br>
        <sub><b>Gabriel Galvão</b></sub>
      </a>
    </td>
  </tr>
</table>

> Squad 5 da matéria Métodos de Desenvolvimento de Software, com a professora Carla Rocha.
