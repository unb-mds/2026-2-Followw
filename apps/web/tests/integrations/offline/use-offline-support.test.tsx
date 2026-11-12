import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from 'bun:test';

import type { UserProfile } from '#/queries/me';

import * as offlineStorage from '#/integrations/offline/storage';
import { useOfflineSupport } from '#/integrations/offline/use-offline-support';
import { meQueryOptions } from '#/queries/me';
import * as restaurant from '#/queries/restaurant';

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
    test('visitante não espera restaurar cache', () => {
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

describe('service worker, cache e pré-carga', () => {
    let register: ReturnType<typeof spyOn>;
    let persist: ReturnType<typeof spyOn>;
    let warm: ReturnType<typeof spyOn>;
    let prefetch: ReturnType<typeof spyOn>;

    beforeEach(() => {
        // o SW só é registrado no build de produção
        process.env.PROD = 'true';
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: { register: () => Promise.resolve() }
        });
        register = spyOn(navigator.serviceWorker, 'register');
        persist = spyOn(offlineStorage, 'persistQueryCache').mockReturnValue(() => {});
        warm = spyOn(offlineStorage, 'warmPages').mockResolvedValue(undefined);
        prefetch = spyOn(restaurant, 'prefetchWeekMenus').mockResolvedValue([]);
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        for (const spy of [register, persist, warm, prefetch]) spy.mockRestore();
        Reflect.deleteProperty(navigator, 'serviceWorker');
        delete process.env.PROD;
    });

    test('visitante não registra o service worker, não salva cache nem pré-carrega', async () => {
        renderWith(null);
        await dom.testing.act(() => jest.advanceTimersByTime(5_000));

        expect(register).not.toHaveBeenCalled();
        expect(persist).not.toHaveBeenCalled();
        expect(warm).not.toHaveBeenCalled();
        expect(prefetch).not.toHaveBeenCalled();
    });

    test('sessão logada registra o service worker, salva o cache e pré-carrega', async () => {
        renderWith(user);
        await dom.testing.act(() => jest.advanceTimersByTime(5_000));

        expect(register).toHaveBeenCalledWith('/sw.js');
        expect(persist).toHaveBeenCalledTimes(1);
        expect(warm).toHaveBeenCalledTimes(1);
        expect(prefetch).toHaveBeenCalledTimes(1);
    });
});
