# Mobile — instruções para agentes

App nativo (iOS e Android) em Expo SDK 58 + Expo Router, Uniwind (Tailwind 4) e React Native
Reusables. Dados, tipos e lógica vêm de `@followw/core`, e as telas replicam as do `apps/web`. Use
sempre **bun**.

## O Expo muda a cada SDK

Não confie na memória: antes de usar uma API do Expo ou do React Native, consulte a documentação da
versão em `package.json` (context7 ou `https://docs.expo.dev/versions/v58.0.0/`).

## Comandos

```fish
bunx expo install <pacote>   # sempre, em vez de bun add: fixa versões compatíveis com o SDK
bun start                    # Metro (dev client)
bun android / bun ios        # gera o build nativo (CNG) e instala
bun web                      # versão web, só para conferir telas durante o desenvolvimento
bun check                    # oxfmt + oxlint + tsc
bun run test                 # jest-expo (não use `bun test`)
bun doctor                   # expo-doctor
```

## Regras

- `ios/` e `android/` são gerados (CNG) e ficam fora do git: configure tudo em `app.config.ts` e
  plugins.
- A interface replica a do web 1:1 (estrutura, textos e classes); padrões nativos só para status
  bar, share sheet, teclado e pull-to-refresh.
- Rotas em `src/app/` (só telas e layouts), sem headers nativos: cada tela passa o header do web
  (`HeaderBar`/`BackHeader`) para `Screen`. As abas são tabs headless (`expo-router/ui`) e a barra
  visível é a `BottomNavigation` do layout raiz; telas abertas de qualquer aba (curso, professor)
  ficam no `Stack` raiz. O `Select` abre as opções num `Drawer`.
- Imports internos via `@/` (`src/`). Componentes base em `src/components/ui` (Reusables,
  adicionados com `bunx shadcn add https://reactnativereusables.com/r/uniwind/<nome>.json`); não os
  reescreva sem motivo.
- Estilo só com classes do Uniwind e os tokens de `src/global.css` (os mesmos do web). Para props
  que não aceitam `className` (ícones nativos, gráficos), use `useColor('token')`.
- Texto sempre com o `Text` de `@/components/ui/text` (aplica a fonte DM Sans); pesos via
  `font-medium`/`font-semibold`/`font-bold`.
- Acesso à API pelas queries do core. Sessão: a API roda no modo nativo (`X-Followw-Auth: header`) e
  os tokens ficam no SecureStore (`src/lib/session.ts`); o cache do Query é persistido no MMKV.
- Antes de criar lógica de tela, procure-a no core; se for pura e o web também precisar, mova para o
  core em vez de duplicar.
- Testes em `tests/` espelhando `src/`, nomeados em português.
