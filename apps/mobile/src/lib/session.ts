import type { Middleware } from 'openapi-fetch';

import { apiClient, setApiOrigin } from '@followw/core/queries/client.ts';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// mesmos JWE dos cookies do web, aqui nos headers do modo nativo da API
const ACCESS_HEADER = 'X-Followw-Access';
const REFRESH_HEADER = 'X-Followw-Refresh';
const KEYS = { access: 'followw.access', refresh: 'followw.refresh' } as const;

type TokenName = keyof typeof KEYS;

// no web (só para desenvolvimento) não há SecureStore
const secure = Platform.select({
    web: {
        get: (key: string) => globalThis.localStorage?.getItem(key) ?? null,
        set: (key: string, value: string) => globalThis.localStorage?.setItem(key, value),
        remove: (key: string) => globalThis.localStorage?.removeItem(key)
    },
    default: {
        get: (key: string) => SecureStore.getItem(key),
        set: (key: string, value: string) =>
            SecureStore.setItem(key, value, {
                keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK
            }),
        remove: (key: string) => void SecureStore.deleteItemAsync(key)
    }
});

const tokens: Record<TokenName, string | null> = {
    access: secure.get(KEYS.access),
    refresh: secure.get(KEYS.refresh)
};

function saveToken(name: TokenName, value: string) {
    if (tokens[name] === value) return;
    tokens[name] = value;
    secure.set(KEYS[name], value);
}

export function clearTokens() {
    for (const name of ['access', 'refresh'] as const) {
        tokens[name] = null;
        secure.remove(KEYS[name]);
    }
}

export const nativeAuthMiddleware: Middleware = {
    onRequest({ request }) {
        request.headers.set('X-Followw-Auth', 'header');
        if (tokens.access) request.headers.set(ACCESS_HEADER, tokens.access);
        if (tokens.refresh) request.headers.set(REFRESH_HEADER, tokens.refresh);
        return request;
    },
    onResponse({ response }) {
        const access = response.headers.get(ACCESS_HEADER);
        const refresh = response.headers.get(REFRESH_HEADER);
        if (access) saveToken('access', access);
        if (refresh) saveToken('refresh', refresh);
        // a senha mudou ou a sessão expirou: os tokens não valem mais
        if (response.status === 401) clearTokens();
    }
};

export const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'https://followw.app';

let installed = false;

/** Aponta o cliente da core para a API e registra o transporte dos tokens. */
export function installApiClient() {
    if (installed) return;
    installed = true;
    setApiOrigin(API_ORIGIN);
    apiClient.use(nativeAuthMiddleware);
}
