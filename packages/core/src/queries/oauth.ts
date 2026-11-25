import type { components } from './schema.gen.ts';

import { api } from './api.ts';
import { apiClient } from './client.ts';

export type OAuthClient = components['schemas']['OAuthClientView'];
export type OAuthClientCreated = components['schemas']['OAuthClientCreated'];
export type OAuthClientCreate = components['schemas']['OAuthClientCreate'];
export type OAuthClientUpdate = components['schemas']['OAuthClientUpdate'];
export type OAuthClientSecret = components['schemas']['OAuthClientSecret'];
export type OAuthGrant = components['schemas']['OAuthGrantView'];

export const oauthClientsQueryOptions = api.queryOptions('get', '/oauth/clients');

export async function createOAuthClient(body: OAuthClientCreate): Promise<OAuthClientCreated> {
    const { data } = await apiClient.POST('/oauth/clients', { body });
    if (!data) throw new Error('Resposta vazia ao criar aplicação.');
    return data;
}

export async function updateOAuthClient(
    clientId: string,
    body: OAuthClientUpdate
): Promise<OAuthClient> {
    const { data } = await apiClient.PATCH('/oauth/clients/{client_id}', {
        params: { path: { client_id: clientId } },
        body
    });
    if (!data) throw new Error('Resposta vazia ao atualizar aplicação.');
    return data;
}

export async function rotateOAuthClientSecret(clientId: string): Promise<OAuthClientSecret> {
    const { data } = await apiClient.POST('/oauth/clients/{client_id}/rotate-secret', {
        params: { path: { client_id: clientId } }
    });
    if (!data) throw new Error('Resposta vazia ao rotacionar segredo.');
    return data;
}

export async function deleteOAuthClient(clientId: string): Promise<void> {
    await apiClient.DELETE('/oauth/clients/{client_id}', {
        params: { path: { client_id: clientId } }
    });
}

export type AuthorizationRequest = NonNullable<
    import('./schema.gen.ts').paths['/oauth/authorize']['get']['parameters']['query']
>;
export const oauthGrantsQueryOptions = api.queryOptions(
    'get',
    '/oauth/grants',
    {},
    { meta: { persist: false } }
);
export const oauthAuthorizationQueryOptions = (query: AuthorizationRequest) =>
    api.queryOptions(
        'get',
        '/oauth/authorize',
        { params: { query } },
        { staleTime: 0, gcTime: 0, retry: false, meta: { persist: false } }
    );
