import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, spyOn, test } from 'bun:test';

import type { UserProfile } from '#/queries/me';

import * as offlineStorage from '#/integrations/offline/storage';
import { useOfflineSupport } from '#/integrations/offline/use-offline-support';
import { meQueryOptions } from '#/queries/me';

import { useDom } from '../../helpers/dom';

const dom = useDom();

function renderWith(user: UserProfile | null) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(meQueryOptions.queryKey, user);
    const states: boolean[] = [];
    dom.testing.renderHook(() => states.push(useOfflineSupport()), {
        wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        )
    });
    return { states, queryClient };
}

const user: UserProfile = {
    name: 'Fulano',
    registration: '251000000',
    photo: null,
    bio: null,
    unit: null,
    course: null,
    entry_semester: null,
    integralization: null,
    workload: null,
    period_max_workload: null,
    ira: null,
    mp: null,
    level: 'Graduação'
};

describe('modo offline', () => {
    test('visitante não restaura nem guarda cache no dispositivo', () => {
        expect(renderWith(null).states).toEqual([false]);
    });

    test('sessão logada espera restaurar o cache salvo', () => {
        const { states } = renderWith(user);
        expect(states[0]).toBe(true);
        expect(states.at(-1)).toBe(false);
    });

    test('libera as consultas de visitante se a sessão acabar durante a restauração', async () => {
        const persist = spyOn(offlineStorage, 'persistQueryCache').mockReturnValue(() => {});
        try {
            const { states, queryClient } = renderWith(user);
            expect(states.at(-1)).toBe(true);

            queryClient.setQueryData(meQueryOptions.queryKey, null);

            await dom.testing.waitFor(() => expect(states.at(-1)).toBe(false));
        } finally {
            persist.mockRestore();
        }
    });
});
