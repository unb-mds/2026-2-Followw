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
```

## Convenções

- Imports internos sempre absolutos via `#/` (`src/`), nunca relativos. Use `import type` para
  tipos. O que vive no core vem de `@followw/core/<pasta>/<arquivo>.ts` (com extensão).
- Nas URLs, os paths são em português (`/turmas`), já os parâmetros (chaves e valores) são sempre em
  inglês (`?meal=lunch`).
- Páginas do app ficam em `src/routes/_app/`, cujo layout (`_app.tsx`) já renderiza o `AppLayout`.
  Cada rota passa o header em `staticData: { header }`; estado dividido entre header e página vai
  para `usePageState`. Páginas fora do app (como `/login`) ficam na raiz de `routes/`.
- Verifique se abstrações em libs são utilizadas no projeto para repetir o padrão. Exemplo: **nuqs**
  (`useQueryState`/`useQueryStates`) ao invés de `Route.useSearch()`, `cn` ao invés de concatenar
  string do className.
- Cores só pelo `@theme` de `src/styles.css`, nunca hex solto. Sem valores arbitrários
  (`text-[13px]`): use a escala do Tailwind, preferencialmente valores pares.
- Prefira flex + gap ao space- do tailwind.
- Testes em `tests/` espelhando `src/`; lógica do core é testada em `packages/core/tests`.
- Arquivos `*.gen.ts` são gerados: nunca edite à mão.

## Acesso à API (`@followw/core`)

Cliente (`apiClient`), `api`, schema gerado e `queryOptions` por recurso vivem em
`packages/core/src/queries` (veja o `AGENTS.md` de lá; `bun generate-api` roda no core). Aqui em
`src/queries` ficam só os acoplados à plataforma: `ssr.ts` (middleware do SSR registrado em
`router.tsx`), `auth.ts`, `documents.ts` e `refresh.ts`.

`fetch` nativo é proibido fora de `queries/**`. Cada recurso exporta `queryOptions` via
`api.queryOptions(...)`; o loader pré-carrega com `loadQuery` (cache primeiro, para nenhuma rota
travar; tratando `ApiError.isUnauthorized`) e o componente consome com `useSuspenseQuery`. O cache é
persistido para uso offline (veja `docs/offline.md`): tela de erro por falta de dado usa
`isLoadingError`; `isError` só onde há dado salvo para exibir junto do aviso de falha.

A API fica em `/api` da mesma origem. No SSR, a origem e os cookies vêm do contexto da requisição,
nunca de variável de módulo (vazaria sessão entre usuários).

Para pedir dado novo à API, use `refreshQuery(queryClient, options)`.
