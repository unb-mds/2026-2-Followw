# Modo offline (service worker + cache do TanStack Query)

O site abre e navega sem internet usando duas camadas independentes, ambas em
`apps/web/src/integrations/offline/`:

| Camada | O que guarda | Onde | Código |
| :--- | :--- | :--- | :--- |
| **Service worker** | JS/CSS/fontes do build e o HTML das páginas | Cache Storage | `pwa.ts` (`vite-plugin-pwa`/Workbox) |
| **Cache do TanStack Query** | Dados da API (perfil, turmas, frequência, notícias, RU, cardápio...) | IndexedDB (`idb-keyval`, chave `followw-query-cache`) | `storage.ts` |

O SW **nunca** cacheia respostas da API: os dados vivem só no cache do Query. O `useOfflineSupport`
(`use-offline-support.ts`, chamado no `__root.tsx`) liga as duas camadas.

## Service worker (`/sw.js`)

Gerado no build (`generateSW`), só no ambiente `client`, e registrado só em produção. Atualiza
sozinho (`autoUpdate`: `skipWaiting` + `clientsClaim`).

- **Assets** (`/assets/**`, `favicon.svg`, `manifest.json`): precache, servidos do cache.
- **Navegações** (HTML do SSR): _network-first_ com timeout de 3 s, gravadas por URL no cache
  `followw-pages-<build>` (`pages-cache.ts`). Sem rede e sem cache para a URL, cai na página pai
  (`/turmas/x` → `/turmas`) ou na home, e o router resolve a rota no client.
- **Pré-carga**: após abrir o app online, `warmPages` baixa `/`, `/ru`, `/turmas` e `/perfil` (ou
  `/login`, sem login) que ainda faltam. O cache de páginas é versionado por build, porque o HTML
  antigo aponta para assets que o SW novo já não tem; os caches de builds antigos são apagados.

## Cache dos dados

- `persistQueryCache` restaura o IndexedDB e passa a salvar cada mudança. Roda **depois da
  hidratação**, para o dado restaurado não divergir do HTML do SSR. Na restauração vence o dado
  mais novo (SSR ou salvo).
- Validade: **14 dias** (`PERSIST_MAX_AGE`: `maxAge` do persister e `gcTime` das queries no
  navegador).
- `buster`: hash de `schema.gen.ts`. Mudou o contrato da API, o cache salvo é descartado.
- O cardápio da semana do campus do usuário é pré-carregado numa só requisição (`prefetchWeekMenus`)
  e gravado na query de cada dia; a query da faixa não fica no cache. Se já houver cardápio salvo
  de algum dia daquela semana (e campus), não busca de novo.

## Nenhuma rota trava

- Loaders usam `loadQuery` (`src/queries/load.ts`): com dado em cache resolvem na hora e revalidam
  em segundo plano; sem cache, esperam a rede.
- Queries e mutações usam `networkMode: 'always'`, e as queries não fazem retry offline: nunca ficam
  pausadas (o que travava o loader), nem se a conexão cair entre uma tentativa e outra.
- As páginas só mostram erro quando **não há** dado (`isLoadingError`): falha ao revalidar mantém o
  que está salvo. `isError` só aparece onde há dado salvo para mostrar junto do aviso, e fica oculto
  offline.

## Interface offline

- `OfflineBanner` no `AppLayout`: "Você está offline".
- `useFailureMessage` (`src/lib/online.ts`) troca a mensagem de falha por `OFFLINE_MESSAGE` ("Você
  está sem conexão com a internet.") quando não há conexão. O `ErrorCard` já faz isso sozinho.
- Login mostra `OFFLINE_MESSAGE` e não envia sem conexão; logout fica desabilitado (o banner explica);
  a renovação da sessão espera a rede voltar.

## Logout e sessão expirada

`clearSession` (e o login, que espera a limpeza terminar) remove todas as queries, exceto as de
`/public/*` e o `/me`, e chama `clearOfflineData`, que apaga o IndexedDB e o HTML em cache (que traz
dados do SSR). O cardápio público continua salvo.

## Testar

```fish
cd apps/web
bun run build
PORT=3100 node .output/server/index.mjs
```

O SW só registra em produção. No DevTools: _Application → Service workers_ e _Network → Offline_.
A API local só aceita CORS de `localhost:3000`; para outra porta, suba com
`CORS_ORIGINS='["http://localhost:3100"]' uv run api`.
