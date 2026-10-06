# Modo offline (service worker + cache do TanStack Query)

O site abre e navega sem internet usando duas camadas independentes:

| Camada | O que guarda | Onde | Código |
| :--- | :--- | :--- | :--- |
| **Service worker** | JS/CSS/fontes do build e o HTML das páginas | Cache Storage | `apps/web/vite/pwa.ts` (`vite-plugin-pwa`/Workbox) |
| **Cache do TanStack Query** | Dados da API (perfil, turmas, frequência, notícias, RU, cardápio...) | IndexedDB (`idb-keyval`, chave `followw-query-cache`) | `src/integrations/tanstack-query/persister.ts` |

O SW **nunca** cacheia respostas da API: os dados vivem só no cache do Query.

## Service worker (`/sw.js`)

Gerado no build (`generateSW`), só no ambiente `client` e só em produção (`serviceWorkerEnabled`
em `src/lib/service-worker.ts`). Atualiza sozinho (`autoUpdate`: `skipWaiting` + `clientsClaim`).

- **Assets** (`/assets/**`, `favicon.svg`, `manifest.json`): precache, servidos do cache.
- **Navegações** (HTML do SSR): _network-first_ com timeout de 3 s, gravadas por URL no cache
  `followw-pages-<build>`. Sem rede e sem cache para a URL, cai na página pai (`/turmas/x` →
  `/turmas`) ou na home, e o router resolve a rota no client.
- **Pré-carga**: após abrir o app online, `warmPages` baixa `/`, `/ru`, `/turmas` e `/perfil` (ou
  `/login`, sem login) que ainda faltam. O cache de páginas é versionado por build, porque o HTML
  antigo aponta para assets que o SW novo já não tem; os caches de builds antigos são apagados.

## Cache dos dados

- `persistQueryCache` restaura o IndexedDB e passa a salvar cada mudança. Roda **depois da
  hidratação** (`useOfflineSupport`, em `src/integrations/offline/`, chamado no `__root.tsx`), para o dado restaurado não divergir do HTML
  do SSR. Na restauração vence o dado mais novo (SSR ou salvo).
- Validade: **14 dias** (`maxAge` do persister = `gcTime` das queries no navegador).
- `buster`: hash de `schema.gen.ts`. Mudou o contrato da API, o cache salvo é descartado.
- O cardápio da semana do campus do usuário é pré-carregado numa só requisição (`prefetchWeekMenus`)
  e gravado na query de cada dia; a query da faixa não fica no cache.

## Nenhuma rota trava

- Loaders usam `loadQuery` (`src/queries/load.ts`): com dado em cache resolvem na hora e revalidam
  em segundo plano; sem cache, esperam a rede.
- Queries usam `networkMode: 'offlineFirst'` e não fazem retry offline: falham logo em vez de ficar
  pausadas (o que travava o loader). Mutações usam `'always'`.
- As páginas só mostram erro quando **não há** dado (`isLoadingError`): falha ao revalidar mantém o
  que está salvo. `isError` só aparece onde há dado salvo para mostrar junto do aviso, e fica oculto
  offline.

## Interface offline

- `OfflineBanner` no `AppLayout`: "Offline · exibindo dados salvos".
- `useFailureMessage` (`src/lib/online.ts`, usado pelo `ErrorCard`) troca a mensagem para "Sem conexão..." quando o dado
  nunca foi salvo.
- Login avisa e não envia sem conexão; logout fica desabilitado; a renovação da sessão espera a rede
  voltar.

## Logout e sessão expirada

`clearSession` (e o login, que espera a limpeza terminar) remove todas as queries fora de `/public/*`, apaga o IndexedDB
(`clearPersistedQueries`) e o HTML em cache (`clearCachedPages`), que pode conter dados do SSR.
O cardápio público continua salvo.

## Testar

```fish
cd apps/web
bun run build
PORT=3100 node .output/server/index.mjs
```

O SW só registra em produção. No DevTools: _Application → Service workers_ e _Network → Offline_.
A API local só aceita CORS de `localhost:3000`; para outra porta, suba com
`CORS_ORIGINS='["http://localhost:3100"]' uv run api`.
