# Core — instruções para agentes

TypeScript compartilhado entre `apps/web` e o futuro app mobile (React Native). Consumido direto do
código-fonte (`exports: "./*": "./src/*"`), sem build: `@followw/core/queries/me.ts`.

## Comandos

```fish
bun check          # oxfmt + oxlint + tsc
bun test           # testes em tests/, espelhando src/
bun generate-api   # gera src/queries/schema.gen.ts a partir de localhost:8000/openapi.json
```

## Convenções

- Nada de plataforma: sem DOM, `window`, `localStorage`, IndexedDB, TanStack Start, PostHog, Vite ou
  React DOM. O `tsconfig` não inclui a lib DOM de propósito.
- Imports internos relativos com extensão `.ts` (o `#/` do web capturaria os do core).
- `apiClient` (`queries/client.ts`) traz só o middleware de erro; cada app registra os seus com
  `apiClient.use(...)` e informa a origem com `setApiOrigin` quando `/api` não é relativo.
- Um arquivo por recurso em `queries/`, exportando `queryOptions` via `api.queryOptions(...)`.
- Testes em português, em `tests/` (nomes como `test('turma fora da lista retorna 404')`).
- Arquivos `*.gen.ts` são gerados: nunca edite à mão.
