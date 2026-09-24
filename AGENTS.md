# Followw UnB — instruções para agentes

## Sobre

O Followw UnB é um client alternativo e open-source para o sistema
lento da UnB, o SIGAA.

O projeto agrega numa experiência só as fontes de informação da UnB hoje
espalhadas em sistemas diferentes (SIGAA, RU, calendário, editais), com
destaque para o acesso autenticado ao SIGAA — dados e ações que só existem
logado, utilizando de cache e outras técnicas para facilitar a vida do estudante.

Não há conta própria do Followw: o login é sempre a matrícula e senha
do SIGAA, delegado ao CAS da UnB. A sessão nunca é persistida no nosso
sistema (vive em cookies assinados no cliente) e cada requisição para
o SIGAA é stateless.

## Layout

Monorepo Python gerenciado como workspace `uv` (`[tool.uv.workspace]` no
`pyproject.toml` raiz, `members = ["apps/*", "packages/*"]`).

```
apps/
  api/              # API pública (FastAPI)
  web/              # Front-end web do Follow
packages/
  sigaa-client/      # biblioteca async que fala com o SIGAA
  unb-browser/       # biblioteca async dos sites públicos da UnB (RU, calendário, editais)
docs/                # requisitos e notas de sprint
compose.yml          # Postgres local, usado pela api
```

Cada app ou pacote tem seu próprio `AGENTS.md` para convenções específicas,
sempre leia-os ao trabalhar nas suas respectivas pastas.

## Comandos

```fish
uv sync                  # instala todo o workspace
uv run pytest            # roda os testes de apps/ e packages/ juntos
uv run ruff check .
uv run ruff format .
```

O `pytest` usa `--import-mode=importlib` (configurado no `pyproject.toml`
raiz): apps e pacotes diferentes podem ter arquivos de teste com o mesmo nome
(`test_auth.py` existe em `apps/api` e em `packages/sigaa-client`) sem colidir.

## Instruções

- Se houver um novo contexto importante, atualize seu devido arquivo AGENTS.md
- Evite complexidade e opte por abstrações quando for necessário
- Crie testes ao implementar novas features/fixes. Se possível, centralize
  todos os testes pertencentes a um mesmo módulo em um único arquivo
- Não adicione longos blocos de comentários, tente fazer single-line comments e
  apenas onde for necessário/muito útil.
