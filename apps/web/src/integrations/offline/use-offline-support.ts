import { noop, onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { persistQueryCache } from '#/integrations/tanstack-query/persister';
import { removeLegacyStorage } from '#/lib/local-storage';
import { useOnline } from '#/lib/online';
import { nowInBrasilia } from '#/lib/schedule';
import {
    offlinePages,
    registerServiceWorker,
    serviceWorkerEnabled,
    warmPages
} from '#/lib/service-worker';
import { meQueryOptions } from '#/queries/me';
import { campusOf, prefetchWeekMenus } from '#/queries/restaurant';

// espera a página assentar antes de ir à rede só para o modo offline
const WARMUP_DELAY = 2_000;

// depois da hidratação, para o cache restaurado não divergir do HTML do SSR
function useOfflineBootstrap() {
    const queryClient = useQueryClient();

    useEffect(() => {
        onlineManager.setOnline(navigator.onLine);
        removeLegacyStorage();
        registerServiceWorker();
        return persistQueryCache(queryClient);
    }, [queryClient]);
}

// com o app aberto e online, deixa páginas e cardápio prontos para o modo offline
function useOfflineWarmup() {
    const queryClient = useQueryClient();
    const online = useOnline();
    const { data: user, isSuccess } = useQuery(meQueryOptions);
    const registration = user?.registration;
    const unity = user?.unity;

    useEffect(() => {
        if (!online || !isSuccess) return undefined;
        const timeout = setTimeout(() => {
            if (serviceWorkerEnabled()) void warmPages(offlinePages(Boolean(registration)));
            prefetchWeekMenus(queryClient, campusOf(unity), nowInBrasilia().date).catch(noop);
        }, WARMUP_DELAY);
        return () => clearTimeout(timeout);
    }, [queryClient, online, isSuccess, registration, unity]);
}

/** Liga o modo offline: cache persistido, service worker e pré-carga. */
export function useOfflineSupport() {
    useOfflineBootstrap();
    useOfflineWarmup();
}
