# Web — instruções para agentes

TanStack Start + Router (file-based) + Query, `openapi-fetch`/`openapi-react-query`, Tailwind v4,
oxlint/oxfmt. Use sempre **bun**.

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

- Imports internos sempre absolutos via `#/` (`src/`), nunca relativos. Use `import type` para
  tipos.
- Tipos `React` são globais: use `React.FC`, `React.ReactNode` etc. sem importar.
- Páginas do app ficam em `src/routes/_app/`, cujo layout (`_app.tsx`) já renderiza o `AppLayout`
  com header e navbar. Cada rota passa o header em `staticData: { header }`; estado dividido entre
  header e página vai para `usePageState`. Páginas fora do app (como `/login`) ficam na raiz de
  `routes/`.
- Cores só pelo `@theme` de `src/styles.css`, nunca hex solto. Sem valores arbitrários
  (`text-[13px]`): use a escala do Tailwind, preferencialmente valores pares.
- Prefira flex + gap a space- do tailwind.
- Testes em `tests/` espelhando `src/`.
- Arquivos `*.gen.ts` são gerados: nunca edite à mão.

## Acesso à API (`src/queries`)

`fetch` nativo é proibido fora de `src/queries/**`. Um arquivo por recurso exportando `queryOptions`
via `api.queryOptions(...)`; o loader pré-carrega com `loadQuery` (cache primeiro, para nenhuma rota
travar; tratando `ApiError.isUnauthorized`) e o componente consome com `useSuspenseQuery`. O cache é
persistido para uso offline (veja `docs/offline.md`): tela de erro por falta de dado usa
`isLoadingError`; `isError` só onde há dado salvo para exibir junto do aviso de falha.

No SSR, os cookies são repassados pelo contexto da requisição, nunca por variável de módulo (vazaria
sessão entre usuários). Em produção o SSR só autentica porque a API grava os cookies com
`Domain=followw.app` (`COOKIE_DOMAIN`).

Para pedir dado novo à API, use `refreshQuery(queryClient, options)`.
