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
bun generate-api           # gera o schema em packages/core a partir de localhost:8000/openapi.json
```

## Convenções

- Imports internos sempre absolutos via `#/` (`src/`), nunca relativos. Use `import type` para
  tipos.
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
- Testes em `tests/` espelhando `src/`.
- Arquivos `*.gen.ts` são gerados: nunca edite à mão.

## Acesso à API (`packages/core/src/queries` e adaptadores em `src/queries`)

`fetch` nativo é proibido fora das pastas de queries. Queries e lógica portável ficam em
`@followw/core`; sessão, SSR e armazenamento ficam no web. Um arquivo por recurso exportando
`queryOptions` via `api.queryOptions(...)`; o loader pré-carrega com `loadQuery` (cache primeiro,
para nenhuma rota travar; tratando `ApiError.isUnauthorized`) e o componente consome com
`useSuspenseQuery`. O cache é persistido para uso offline (veja `docs/offline.md`): tela de erro por
falta de dado usa `isLoadingError`; `isError` só onde há dado salvo para exibir junto do aviso de
falha.

A API fica em `/api` da mesma origem. No SSR, a origem e os cookies vêm do contexto da requisição,
nunca de variável de módulo (vazaria sessão entre usuários).

Para pedir dado novo à API, use `refreshQuery(queryClient, options)`.
