import { refreshQuery as refresh } from '@followw/core/queries/refresh.ts';
import { createIsomorphicFn } from '@tanstack/react-start';

// No navegador, `cache: 'reload'` faz o próprio fetch mandar `Cache-Control: no-cache`
// sem disparar preflight de CORS; no SSR o header vai direto.
const freshInit = createIsomorphicFn()
    .client((): RequestInit => ({ cache: 'reload' }))
    .server((): RequestInit => ({ headers: { 'Cache-Control': 'no-cache' } }));

/** Refaz a query pedindo à API que ignore o cache dela, e grava o resultado na mesma queryKey. */
export const refreshQuery: typeof refresh = (queryClient, options, extra) =>
    refresh(queryClient, options, { init: freshInit(), ...extra });
