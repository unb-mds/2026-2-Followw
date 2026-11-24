import type { components } from './schema.gen.ts';

import { api } from './api.ts';
import { apiClient } from './client.ts';

export type OAuthClient = components['schemas']['OAuthClientView'];
export type OAuthClientCreated = components['schemas']['OAuthClientCreated'];
export type OAuthClientCreate = components['schemas']['OAuthClientCreate'];
export type OAuthClientUpdate = components['schemas']['OAuthClientUpdate'];
export type OAuthClientSecret = components['schemas']['OAuthClientSecret'];
export type OAuthGrant = components['schemas']['OAuthGrantView'];
export type OAuthScope = components['schemas']['Scope'];

export const OAUTH_SCOPE_LABELS: Record<OAuthScope, string> = {
    'profile:read': 'Ler nome, matrícula, foto e curso',
    'profile:write': 'Editar foto e bio no SIGAA',
    'classrooms:read': 'Ler turmas atuais e horários das aulas',
    'classrooms.history:read': 'Consultar turmas de semestres anteriores',
    'grades:read': 'Ler menções, IRA e MP',
    'classrooms.members:read': 'Ver participantes das turmas e contato',
    'classrooms.frequency:read': 'Ler frequência e marcações pessoais',
    'classrooms.frequency:write': 'Alterar marcações pessoais de frequência',
    'classrooms.posts:read': 'Ler posts e baixar materiais das turmas',
    'transcript:read': 'Baixar o histórico acadêmico completo',
    'ru:read': 'Consultar saldo e extrato do RU',
    'internships:read': 'Consultar ofertas de estágio'
};

export const oauthClientsQueryOptions = api.queryOptions('get', '/oauth/clients');
export const oauthGrantsQueryOptions = api.queryOptions('get', '/oauth/grants');

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

export async function revokeOAuthGrant(grantId: string): Promise<void> {
    await apiClient.DELETE('/oauth/grants/{grant_id}', {
        params: { path: { grant_id: grantId } }
    });
}
