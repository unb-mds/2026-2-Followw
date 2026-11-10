# Followw UnB — instruções para agentes

## Sobre

O Followw UnB reúne dados dos sistemas da UnB, principalmente o SIGAA, em uma API independente e
um front-end, com cache para agilizar consultas.

O login usa a conta do SIGAA via CAS da UnB, sem conta própria do Followw. A sessão vive em cookies
cifrados no cliente; as requisições são stateless e a sessão não é persistida no servidor.

## Estrutura

```text
apps/
  api/              # API pública (FastAPI)
  web/              # Front-end web do Followw
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
uv run pytest -n auto   # testes em paralelo (requer Docker ativo para a api)
uv run pytest <pasta>   # roda apenas o pacote ou diretório desejado
uv run ruff format .    # sempre formate ao alterar o código
```

## Instruções

- Não atualize os arquivos de agentes a cada tarefa que fizer, faça-o somente se houver um novo
  contexto muito importante, ou uma alteração de regra já documentada. Não é necessário documentar
  coisas específicas de um escopo e que podem ser facilmente entendidas lendo o código.
- Os princípios desse projeto são transparência e modularidade. Sempre evite complexidade e opte por
  abstrações quando for necessário.
- O Followw atualmente segue um rolling release. Não precisa manter compatibilidade com versões
  anteriores (migrações de dados, chaves legadas, aliases), a menos que seja solicitado
  explicitamente
- Crie testes ao implementar novas features/fixes, numa pasta por feature e um arquivo por
  comportamento ou tela (passou de ~400 linhas, divida). Um arquivo de teste nunca importa outro:
  o que é compartilhado vai para `conftest.py`, `helpers.py` ou `fakes.py`. Nomeie os testes em
  português (ex.: `test_turma_fora_da_lista_retorna_404`, `test('carrega a conta autenticada')`).
- Evite longos blocos de comentários/documentação. Tente usar apenas uma linha e apenas onde for
  necessário/muito útil.
- Use meios de validar suas alterações, se necessário, você pode utilizar as envs TEST_REGISTRATION
  e TEST_PASSWORD para fazer login pela api ou pelo navegador.
