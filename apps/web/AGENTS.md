# Web — instruções para agentes

## Stack

| Camada          | Ferramenta                              |
| --------------- | --------------------------------------- |
| Meta‑framework  | TanStack Start                          |
| Roteamento      | TanStack Router (file‑based)            |
| Estado servidor | TanStack Query                          |
| API Client      | `openapi-fetch` + `openapi-react-query` |
| Estilos         | Tailwind CSS v4                         |
| Lint & Formato  | oxlint + oxfmt                          |
| Package Manager | bun                                     |

## Comandos

```fish
bun dev             # dev server na porta 3000
bun build           # build de produção
bun preview         # preview do build
bun generate-api    # gera src/queries/schema.gen.ts a partir do OpenAPI
bun generate-routes # gera routeTree.gen.ts
bun check           # roda verificação de formatação e lint
bun lint            # oxlint
bun fmt             # oxfmt
```

## Estilos

- A paleta de cores vive no `@theme` de `src/styles.css` (`primary`, `ink`, `muted`, `line`, ...). Use as classes geradas (`text-ink`, `bg-primary/10`) ou `var(--color-*)` em `style`; nunca hex solto no JSX.
- Não use valores arbitrários (`text-[13px]`, `w-[54px]`); use a escala padrão do Tailwind (`text-sm`, `w-12`).

## Camada de Acesso à API (`src/queries`)

Todo acesso HTTP à API do Followw UnB é centralizado em `src/queries/`.
É expressamente proibido usar `fetch` nativo fora de `src/queries/**` (regra `no-restricted-globals` no oxlint).

### Arquivos estruturais

- `schema.gen.ts`: Tipos TypeScript gerados automaticamente a partir do `/openapi.json` da API FastAPI. **Nunca edite à mão.**
- `client.ts`: Cliente único do `openapi-fetch` com:
    - Base URL vinda de `VITE_API_URL` (default: `http://localhost:8000`);
    - `credentials: 'include'` para envio automático dos cookies de sessão `httponly`;
    - Middleware de SSR que repassa o header `cookie` da requisição original para a API no servidor;
    - Middleware de tratamento de erro que lança instâncias previsíveis de `ApiError` quando o status for `>= 400`.
- `api.ts`: Adaptador `openapi-react-query` gerado a partir do `apiClient`.
- `errors.ts`: Classe `ApiError` contendo `status`, `detail` e getters utilitários (`isUnauthorized`, `isForbidden`, `isNotFound`, `isServerError`).

### Geração de Tipos da API

```fish
# Com backend local padrão (http://localhost:8000/openapi.json)
bun run generate-api

# Com URL personalizada via argumento
bun run generate-api https://api.staging.followw.app/openapi.json

# Ou via variável de ambiente
OPENAPI_URL=https://api.followw.app/openapi.json bun run generate-api
```

### Padrão de Definição de Queries

Defina cada recurso em um arquivo próprio dentro de `src/queries/`:

```ts
// src/queries/me.ts
import { api } from '#/queries/api.ts';

export const meQueryOptions = api.queryOptions('get', '/me');
```

Para queries com parâmetros:

```ts
// src/queries/classrooms.ts
import { api } from '#/queries/api.ts';

export const classroomsQueryOptions = (semester?: string) =>
    api.queryOptions('get', '/classrooms', {
        params: {
            query: { semester }
        }
    });
```

### Uso em Rotas (Loaders e Componentes)

Em loaders de rotas, use `ensureQueryData` para pré-carregar os dados tanto no SSR quanto na navegação client-side. Em componentes, consuma com `useSuspenseQuery`:

```tsx
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ApiError } from '#/queries/errors.ts';
import { meQueryOptions } from '#/queries/me.ts';

export const Route = createFileRoute('/')({
    loader: async ({ context }) => {
        try {
            await context.queryClient.ensureQueryData(meQueryOptions);
        } catch (error) {
            if (error instanceof ApiError && error.isUnauthorized) {
                // Sessão expirada ou ausente — redireciona para login se necessário
                // throw redirect({ to: '/login' });
            }
            throw error;
        }
    },
    errorComponent: ({ error }) => {
        if (error instanceof ApiError && error.isUnauthorized) {
            return <p>Sessão expirada. Faça login novamente.</p>;
        }
        return <p>Erro inesperado ao carregar dados.</p>;
    },
    component: HomePage
});

function HomePage() {
    const { data: user } = useSuspenseQuery(meQueryOptions);
    return <h1>Olá, {user.name}!</h1>;
}
```

## Convenções

- Imports internos são sempre absolutos via `#/` (aponta para `src/`), nunca `./` ou `../`.
- Rotas seguem a convenção _file-based_ do TanStack Router (`routeTree.gen.ts`).
- O `AppLayout` (com a `BottomNavigation`) é renderizado uma vez no `__root.tsx` em volta do `<Outlet />`; rotas e `errorComponent`s não devem envolvê-lo de novo, senão a navbar remonta e perde a animação entre abas.
- Estilos usam Tailwind CSS v4 direto nas classes JSX.
- Arquivos gerados (`routeTree.gen.ts`, `schema.gen.ts`) são ignorados no `.oxlintrc.json`.

## agents paizao(gabzera)

# apps/web — instruções para agentes

## Stack & Tecnologias

- **Runtime & Package Manager**: Bun (`bun run dev` para iniciar o servidor do front-end web)
- **Framework**: TanStack Start (`@tanstack/react-start`)
- **Build Tool**: Vite
- **Styling**: Tailwind CSS

## Convenções

- Utilize Bun (`bun run dev`, `bun install`, `bun test`, etc.) ao interagir com a aplicação web em `apps/web/`.
- Siga as especificações do TanStack Start e Tailwind CSS para construção de rotas, componentes e estilização.
