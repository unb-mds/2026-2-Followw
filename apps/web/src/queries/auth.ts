import { usePostHog } from '@posthog/react';
import { type Query, type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { OfflineSession } from '#/integrations/offline/session';

import {
    changeOfflineSession,
    isCurrentOfflineSession,
    isSupersededOfflineSession,
    matchesOfflineAccount,
    OFFLINE_SESSION_STORAGE_KEY,
    readOfflineSession
} from '#/integrations/offline/session';
import { clearOfflineData, stopOfflineWork } from '#/integrations/offline/storage';
import { clearAccountStorage } from '#/lib/local-storage';
import { useOnline } from '#/lib/online';
import { api } from '#/queries/api.ts';
import { apiClient } from '#/queries/client.ts';
import { ApiError } from '#/queries/errors.ts';
import { meQueryOptions } from '#/queries/me.ts';

// No logout, remove os dados e mantém o /me em cache como visitante.
const isAccountQuery = ({ queryKey: [, path] }: Query) => path !== '/me';
let sessionRefresh: AbortController | undefined;
let refreshedRegistration: string | undefined;

function resetSessionInTab(
    queryClient: QueryClient,
    clearPersisted = false,
    resolvingProfile = false
) {
    sessionRefresh?.abort();
    refreshedRegistration = undefined;
    stopOfflineWork();
    clearAccountStorage(clearPersisted);
    if (!resolvingProfile) void queryClient.cancelQueries({ queryKey: meQueryOptions.queryKey });
    queryClient.removeQueries({ predicate: isAccountQuery });
    if (!resolvingProfile) queryClient.setQueryData(meQueryOptions.queryKey, null);
}

function clearUserData(queryClient: QueryClient, resolvingProfile = false) {
    changeOfflineSession(null);
    const cleared = clearOfflineData();
    resetSessionInTab(queryClient, true, resolvingProfile);
    return cleared;
}

export async function expireProfileSession(queryClient: QueryClient, session: OfflineSession) {
    if (isCurrentOfflineSession(session)) await clearUserData(queryClient, true);
}

export function clearSession(queryClient: QueryClient) {
    if (!isSupersededOfflineSession()) return clearUserData(queryClient);
    resetSessionInTab(queryClient);
    return Promise.resolve();
}

/** O login deu certo, mas o /me seguinte não levou os cookies que ele gravou. */
export class SessionNotStoredError extends Error {
    constructor() {
        super('O navegador não guardou os cookies do login');
        this.name = 'SessionNotStoredError';
    }
}

/** Troca os dados da conta anterior pelo perfil da nova; falha se ele não vier. */
export async function startSession(queryClient: QueryClient, registration: string) {
    await clearUserData(queryClient);
    // um /me em voo saiu sem os cookies do login, e o `query` o reaproveitaria
    await queryClient.cancelQueries({ queryKey: meQueryOptions.queryKey });
    changeOfflineSession(registration);
    const user = await queryClient.query({ ...meQueryOptions, staleTime: 0 });
    if (!user) throw new SessionNotStoredError();
    return user;
}

export function useLogin() {
    const queryClient = useQueryClient();
    const posthog = usePostHog();
    // retorna a promise para o login seguir pendente até o perfil chegar
    return api.useMutation('post', '/auth/sigaa', {
        onSuccess: async (_data, { body }) => {
            try {
                await startSession(queryClient, body.registration);
            } catch (error) {
                if (error instanceof SessionNotStoredError) posthog.capture('login_session_lost');
                throw error;
            }
        }
    });
}

export function useLogout(onLoggedOut?: () => void) {
    const queryClient = useQueryClient();
    const posthog = usePostHog();
    return api.useMutation('delete', '/auth/sigaa', {
        onMutate: async () => {
            sessionRefresh?.abort();
            const pending = queryClient.getQueryCache().findAll({
                fetchStatus: 'fetching',
                predicate: ({ queryKey: [method, path] }) =>
                    method === 'get' && typeof path === 'string' && !path.startsWith('/public/')
            });
            const cancelled = new Set(pending);
            await queryClient.cancelQueries({ predicate: (query) => cancelled.has(query) });
            return cancelled;
        },
        onError: (_error, _variables, cancelled) => {
            if (queryClient.getQueryData(meQueryOptions.queryKey))
                void queryClient.refetchQueries({
                    predicate: (query) => cancelled?.has(query) ?? false
                });
        },
        onSuccess: () => {
            const cleared = clearUserData(queryClient);
            posthog.reset();
            onLoggedOut?.();
            return cleared;
        }
    });
}

export function useSessionRefresh() {
    const queryClient = useQueryClient();
    const { data: user } = useQuery(meQueryOptions);
    const online = useOnline();

    useEffect(() => {
        const profile = queryClient.getQueryData(meQueryOptions.queryKey);
        const registration = profile?.registration;
        if (registration && !matchesOfflineAccount(registration)) resetSessionInTab(queryClient);
        const onSessionChange = (event: StorageEvent) => {
            if (event.key === OFFLINE_SESSION_STORAGE_KEY && event.oldValue !== null)
                resetSessionInTab(queryClient);
        };
        window.addEventListener('storage', onSessionChange);
        if (profile === null && navigator.onLine && readOfflineSession()?.registration)
            void queryClient.refetchQueries({ queryKey: meQueryOptions.queryKey });
        return () => window.removeEventListener('storage', onSessionChange);
    }, [queryClient]);

    useEffect(() => {
        if (!user || !online || refreshedRegistration === user.registration) return;
        if (queryClient.getQueryData(meQueryOptions.queryKey)?.registration !== user.registration)
            return;
        refreshedRegistration = user.registration;
        const controller = new AbortController();
        sessionRefresh = controller;
        apiClient
            .POST('/auth/sigaa/refresh', { signal: controller.signal })
            .catch((error: unknown) => {
                if (!controller.signal.aborted && error instanceof ApiError && error.isUnauthorized)
                    void clearSession(queryClient);
            })
            .finally(() => {
                if (sessionRefresh === controller) sessionRefresh = undefined;
            });
    }, [user, online, queryClient]);
}
