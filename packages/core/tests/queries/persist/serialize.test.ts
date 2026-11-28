import type { DehydratedState } from '@tanstack/react-query';

import { expect, test } from 'bun:test';

import { serializeCache } from '../../../src/queries/persist.ts';
import { credentialsQueryOptions } from '../../../src/queries/restaurant-account.ts';

test('salva a falha como sucesso e a carteirinha sem invalidar', () => {
    const card = credentialsQueryOptions('251000000').queryKey;
    const state = { status: 'error', error: {}, fetchFailureCount: 2, isInvalidated: true };
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- estado salvo mínimo
    const clientState = {
        queries: [
            { queryKey: card, state: { ...state } },
            { queryKey: ['/me'], state: { ...state } }
        ],
        mutations: []
    } as unknown as DehydratedState;

    const [saved, other] = JSON.parse(serializeCache({ clientState })).clientState.queries;
    expect(saved.state).toMatchObject({
        status: 'success',
        error: null,
        fetchFailureCount: 0,
        isInvalidated: false
    });
    expect(other.state.isInvalidated).toBe(true);
});
