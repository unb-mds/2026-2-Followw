import type { PersistedClient } from '@tanstack/react-query-persist-client';

import { credentialsQueryOptions } from '@followw/core/queries/restaurant-account.ts';
import { QueryClient } from '@tanstack/react-query';

import { serializeCache, shouldPersistQuery } from '@/lib/query-client';

jest.mock('expo-network', () => ({ addNetworkStateListener: () => ({ remove: jest.fn() }) }));
jest.mock('@/queries/auth', () => ({ clearSession: jest.fn() }));

const query = (queryKey: readonly unknown[], meta?: Record<string, unknown>) => {
    const client = new QueryClient();
    client.setQueryData(queryKey, { ok: true });
    const found = client.getQueryCache().find({ queryKey })!;
    if (meta) found.options.meta = meta;
    return found;
};

describe('cache salvo no dispositivo', () => {
    test('consultas com `meta.persist: false` ficam só na memória', () => {
        expect(shouldPersistQuery(query(['a']))).toBe(true);
        expect(shouldPersistQuery(query(['b'], { persist: false }))).toBe(false);
    });

    test('dado que falhou ao atualizar continua salvo', () => {
        const failed = query(['a']);
        failed.setState({ status: 'error', error: new Error('offline') });
        expect(shouldPersistQuery(failed)).toBe(true);
    });

    test('salva a falha como sucesso e a carteirinha sem invalidar', () => {
        const card = credentialsQueryOptions('251000000').queryKey;
        const state = { status: 'error', error: {}, fetchFailureCount: 2, isInvalidated: true };
        const snapshot = {
            clientState: {
                queries: [
                    { queryKey: card, state: { ...state } },
                    { queryKey: ['/me'], state: { ...state } }
                ],
                mutations: []
            }
        } as unknown as PersistedClient;

        const [saved, other] = JSON.parse(serializeCache(snapshot)).clientState.queries;
        expect(saved.state).toMatchObject({
            status: 'success',
            error: null,
            fetchFailureCount: 0,
            isInvalidated: false
        });
        expect(other.state.isInvalidated).toBe(true);
    });
});
