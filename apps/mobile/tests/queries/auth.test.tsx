import type { Middleware } from 'openapi-fetch';

import { apiClient, setApiOrigin } from '@followw/core/queries/client.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';

import { clearSession, useSessionRefresh } from '@/queries/auth';

jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
jest.mock('@/lib/analytics', () => ({ useAnalytics: () => ({ capture: jest.fn() }) }));

const user = { registration: '251000000', name: 'Aluno' };

test('sair aborta a renovação pendente da conta anterior', async () => {
    let signal: AbortSignal | undefined;
    const middleware: Middleware = {
        onRequest({ request }) {
            signal = request.signal;
            // a renovação fica pendente até ser abortada
            return new Promise<Response>((_, reject) =>
                request.signal.addEventListener('abort', () => reject(request.signal.reason))
            );
        }
    };
    setApiOrigin('https://followw.test');
    apiClient.use(middleware);
    const queryClient = new QueryClient();
    queryClient.setQueryData(meQueryOptions.queryKey, user as never);

    await renderHook(() => useSessionRefresh(), {
        wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        )
    });
    await waitFor(() => expect(signal).toBeDefined());

    clearSession(queryClient);

    expect(signal?.aborted).toBe(true);
    expect(queryClient.getQueryData(meQueryOptions.queryKey)).toBeNull();
    apiClient.eject(middleware);
});
