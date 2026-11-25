import type { Middleware } from 'openapi-fetch';

import { apiClient } from '@followw/core/queries/client.ts';
import { oauthClientsQueryOptions } from '@followw/core/queries/oauth.ts';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { expect, test } from 'bun:test';

import { useClientActions, type RevealedSecret } from '#/components/developers/use-client-actions';

import { useDom } from '../../helpers/dom';

const dom = useDom();

test('entrega o segredo criado mesmo enquanto a atualização da lista está pendente', async () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } }
    });
    client.setQueryData(oauthClientsQueryOptions.queryKey, []);
    const refresh = Promise.withResolvers<Response>();
    const middleware: Middleware = {
        onRequest: ({ request }) =>
            request.method === 'POST'
                ? Response.json({ client_id: 'flw_app_agenda', client_secret: 'flw_sec_unico' })
                : refresh.promise
    };
    apiClient.use(middleware);
    const secrets: RevealedSecret[] = [];
    const hook = dom.testing.renderHook(
        () => {
            useQuery(oauthClientsQueryOptions);
            return useClientActions((secret) => secrets.push(secret));
        },
        {
            wrapper: ({ children }) => (
                <QueryClientProvider client={client}>{children}</QueryClientProvider>
            )
        }
    );
    try {
        await dom.testing.act(async () => {
            await hook.result.current.create.mutateAsync({
                name: 'Agenda',
                confidential: true,
                redirect_uris: ['https://agenda.test/callback']
            });
        });
        expect(secrets).toMatchObject([
            { clientId: 'flw_app_agenda', clientSecret: 'flw_sec_unico' }
        ]);
        expect(client.isFetching({ queryKey: oauthClientsQueryOptions.queryKey })).toBe(1);
    } finally {
        refresh.resolve(Response.json([]));
        hook.unmount();
        client.clear();
        apiClient.eject(middleware);
    }
});
