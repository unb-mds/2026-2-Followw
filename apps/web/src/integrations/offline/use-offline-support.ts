import { noop, onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { persistQueryCache, warmPages } from '#/integrations/offline/storage';
import { useOnline } from '#/lib/online';
import { nowInBrasilia } from '#/lib/schedule';
import { meQueryOptions } from '#/queries/me';
import { campusOf, prefetchWeekMenus } from '#/queries/restaurant';

// espera a página assentar antes de ir à rede só para o modo offline
const WARMUP_DELAY = 2_000;

// o SW só é gerado no build de produção
const serviceWorkerEnabled = () => import.meta.env.PROD && 'serviceWorker' in navigator;

/** Liga o modo offline: cache persistido, service worker e pré-carga. */
export function useOfflineSupport() {
    const queryClient = useQueryClient();
    const online = useOnline();
    const { data: user, isSuccess } = useQuery(meQueryOptions);
    const loggedIn = Boolean(user);
    const campus = campusOf(user?.unity);

    // depois da hidratação, para o cache restaurado não divergir do HTML do SSR
    useEffect(() => {
        onlineManager.setOnline(navigator.onLine);
        if (serviceWorkerEnabled()) navigator.serviceWorker.register('/sw.js').catch(noop);
        return persistQueryCache(queryClient);
    }, [queryClient]);

    // com o app aberto e online, deixa páginas e cardápio da semana prontos para o modo offline
    useEffect(() => {
        if (!online || !isSuccess) return undefined;
        const timeout = setTimeout(() => {
            if (serviceWorkerEnabled()) void warmPages(loggedIn);
            prefetchWeekMenus(queryClient, campus, nowInBrasilia().date).catch(noop);
        }, WARMUP_DELAY);
        return () => clearTimeout(timeout);
    }, [queryClient, online, isSuccess, loggedIn, campus]);
}
