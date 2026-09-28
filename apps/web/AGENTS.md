# Web — instruções para agentes

TanStack Start + Router (file-based) + Query, `openapi-fetch`/`openapi-react-query`,
Tailwind v4, oxlint/oxfmt. Use sempre **bun**.

## Comandos

```fish
bun dev                    # porta 3000
bun fmt && bun lint        # formata e corrige lint
bun check                  # verifica formatação + lint (sem alterar)
bun test                   # testes em tests/
bun generate-routes        # gera routeTree.gen.ts
bun generate-api [url]     # gera src/queries/schema.gen.ts (default: localhost:8000/openapi.json, ou OPENAPI_URL)
```

## Convenções

- Imports internos sempre absolutos via `#/` (`src/`), nunca relativos.
- Tipos `React` são globais: use `React.FC`, `React.ReactNode`, etc. sem importar. imports nomeados (`useState`) são ok.
- Sempre use import type quando estiver importando definições de tipos.
- O `AppLayout` (com `BottomNavigation`) é renderizado só no `__root.tsx`; rotas e `errorComponent`s não o envolvem de novo, senão a navbar remonta e perde a animação.
- Cores só pelo `@theme` de `src/styles.css` (`text-ink`, `bg-primary/10` ou `var(--color-*)`), nunca hex solto. Sem valores arbitrários (`text-[13px]`); use a escala do Tailwind e, preferencialmente, valores pares.
- Testes em `tests/` espelhando `src/` (`src/lib/schedule.ts` → `tests/lib/schedule.test.ts`).
- Arquivos `*.gen.ts` são gerados: nunca edite à mão.

## Acesso à API (`src/queries`)

`fetch` nativo é proibido fora de `src/queries/**`. Tudo passa por:

- `client.ts`: `openapi-fetch` com base `VITE_API_URL` e `credentials: 'include'`. No SSR, um middleware repassa o `cookie` da requisição original e devolve os `Set-Cookie` da API ao navegador — sempre lidos do contexto da requisição, nunca de variável de módulo (vazaria sessão entre usuários). Status `>= 400` vira `ApiError`.
- `errors.ts`: `ApiError` com `status`, `detail` e `isUnauthorized`/`isForbidden`/`isNotFound`/`isServerError`.
- `api.ts`: adaptador `openapi-react-query`.

Um arquivo por recurso exportando `queryOptions`:

```ts
// src/queries/classrooms.ts
export const classroomsQueryOptions = (semester?: string) =>
    api.queryOptions('get', '/classrooms', { params: { query: { semester } } });
```

No loader, pré-carregue com `context.queryClient.query(...)` (tratando `ApiError.isUnauthorized`); no componente, consuma com `useSuspenseQuery`.

O SSR só autentica em produção porque a API grava os cookies com `Domain=followw.app` (`COOKIE_DOMAIN`); sem isso eles ficam presos a `api.followw.app` e o `/me` hidrata como `null` após reload. Em dev não precisa.
