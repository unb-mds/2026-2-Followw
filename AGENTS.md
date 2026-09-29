# Followw UnB — instruções para agentes

## Sobre

O Followw UnB é um cliente alternativo open-source que reúne os sistemas da UnB, principalmente o
SIGAA, em uma única API (independente) e um front-end.

O projeto tem destaque para o acesso autenticado ao SIGAA, utilizando de cache e outras técnicas
para facilitar a vida do estudante.

Não há conta própria do Followw, o login é a própria conta do SIGAA, delegado ao CAS da UnB. A
sessão nunca é persistida no nosso sistema (vive em cookies cifrados no cliente) e cada requisição é
stateless.

## Estrutura

```
apps/
  api/              # API pública (FastAPI)
  web/              # Front-end web do Follow
packages/
  sigaa-client/      # biblioteca async que fala com o SIGAA
  unb-browser/       # biblioteca async dos sites públicos da UnB fora do SIGAA
docs/                # documentação e notas de sprint
```

Cada app ou pacote tem seu próprio `AGENTS.md` para convenções específicas, sempre leia-os ao
trabalhar nas suas respectivas pastas.

## Comandos

```fish
uv sync                 # instala todo o workspace
uv run pytest           # testes
uv run ruff format .    # sempre formate ao alterar o código
```

## Instruções

- Não atualize os arquivos de agentes a cada tarefa que fizer, faça-o somente se houver um novo
  contexto muito importante, ou uma alteração de regra já documentada. Não é necessário documentar
  coisas específicas de um escopo e que podem ser facilmente entendidas lendo o código.
- Os princípios desse projeto são transparência e modularidade. Sempre evite complexidade e opte por
  abstrações quando for necessário.
- Crie testes ao implementar novas features/fixes. Se possível, centralize todos os testes
  pertencentes a um mesmo módulo em um único arquivo.
- Evite longos blocos de comentários/documentação. Tente usar apenas uma linha e apenas onde for
  necessário/muito útil.
