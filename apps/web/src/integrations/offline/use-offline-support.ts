import { noop, onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { pagesCacheName } from '#/integrations/offline/pages-cache';
import { bindOfflineSession } from '#/integrations/offline/session';
import { persistQueryCache, warmPages } from '#/integrations/offline/storage';
import { useOnline } from '#/lib/online';
import { nowInBrasilia } from '#/lib/schedule';
import { meQueryOptions } from '#/queries/me';
import { campusOf, prefetchWeekMenus } from '#/queries/restaurant';

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
        const session = bindOfflineSession(registration);
        if (session && serviceWorkerEnabled()) {
            const pages = pagesCacheName(import.meta.env.VITE_BUILD_ID ?? 'dev');
            navigator.serviceWorker
                .register(`/sw.js?${new URLSearchParams({ pages, session: session.id })}`)
                .catch(noop);
        }
        return persistQueryCache(queryClient, registration, () => setRestoring(false));
    }, [queryClient, registration]);

    // com o app aberto e online, deixa páginas e cardápio da semana prontos para o modo offline
    useEffect(() => {
        if (!online || !registration) return undefined;
        const session = bindOfflineSession(registration);
        if (!session) return undefined;
        const timeout = setTimeout(() => {
            if (queryClient.getQueryData(meQueryOptions.queryKey)?.registration !== registration)
                return;
            if (serviceWorkerEnabled()) warmPages(session).catch(noop);
            prefetchWeekMenus(queryClient, campus, nowInBrasilia().date).catch(noop);
        }, WARMUP_DELAY);
        return () => clearTimeout(timeout);
    }, [queryClient, online, campus, registration]);

    return loggedIn && restoring;
}
