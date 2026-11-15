import { useOnline } from '@followw/core/lib/online.ts';
import { nowInBrasilia } from '@followw/core/lib/schedule.ts';
import { campusOf, prefetchWeekMenus } from '@followw/core/queries/restaurant.ts';
import { noop, onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { persistQueryCache, warmPages } from '#/integrations/offline/storage';
import { meQueryOptions } from '#/queries/me';

// espera a página assentar antes de ir à rede só para o modo offline
const WARMUP_DELAY = 2_000;

// o SW só é gerado no build de produção
const serviceWorkerEnabled = () => import.meta.env.PROD && 'serviceWorker' in navigator;

/** Liga o modo offline da sessão logada: cache persistido, service worker e pré-carga. Devolve se o cache ainda está sendo restaurado. */
export function useOfflineSupport() {
    const queryClient = useQueryClient();
    const online = useOnline();
    const { data: user } = useQuery(meQueryOptions);
    const loggedIn = Boolean(user);
    const registration = user?.registration;
    const [restoring, setRestoring] = useState(loggedIn);
    const campus = campusOf(user?.unit?.code);

    useEffect(() => onlineManager.setOnline(navigator.onLine), []);

    // depois da hidratação, para o cache restaurado não divergir do HTML do SSR
    useEffect(() => {
        if (!registration) return undefined;
        if (serviceWorkerEnabled()) navigator.serviceWorker.register('/sw.js').catch(noop);
        return persistQueryCache(queryClient, () => setRestoring(false));
    }, [queryClient, registration]);

    // com o app aberto e online, deixa páginas e cardápio da semana prontos para o modo offline
    useEffect(() => {
        if (!online || !loggedIn) return undefined;
        const timeout = setTimeout(() => {
            if (queryClient.getQueryData(meQueryOptions.queryKey)?.registration !== registration)
                return;
            if (serviceWorkerEnabled()) warmPages().catch(noop);
            prefetchWeekMenus(queryClient, campus, nowInBrasilia().date).catch(noop);
        }, WARMUP_DELAY);
        return () => clearTimeout(timeout);
    }, [queryClient, online, loggedIn, campus, registration]);

    return loggedIn && restoring;
}
