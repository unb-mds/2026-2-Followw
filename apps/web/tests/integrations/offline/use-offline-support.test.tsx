import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { UserProfile } from '#/queries/me';

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
    return states;
}

describe('modo offline', () => {
    test('visitante não restaura nem guarda cache no dispositivo', () => {
        expect(renderWith(null)).toEqual([false]);
    });

    test('sessão logada espera restaurar o cache salvo', () => {
        const states = renderWith({
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
        });
        expect(states[0]).toBe(true);
        expect(states.at(-1)).toBe(false);
    });
});
