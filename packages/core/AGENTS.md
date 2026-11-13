# Core — instruções para agentes

TypeScript compartilhado entre web e futuros clientes. Consumido direto do código-fonte, sem build:
`@followw/core/queries/subjects.ts`.

- Sem DOM, armazenamento, TanStack Start ou imports de apps. Adaptadores de plataforma ficam no app.
- Imports internos relativos com extensão `.ts`; testes em `tests/`, espelhando `src/`.
- Cada plataforma configura a origem fixa com `setApiOrigin` e seus middlewares com `apiClient.use`.
  Nunca guarde cookies ou a origem de uma requisição SSR em variáveis de módulo.
- `bun check`, `bun test` e `bun generate-api` rodam neste diretório.
- `src/queries/schema.gen.ts` é gerado; nunca edite à mão.
