import type { AuthorizationRequest } from '@followw/core/queries/oauth.ts';

export const AUTHORIZATION_SEARCH_KEYS = [
    'response_type',
    'client_id',
    'redirect_uri',
    'scope',
    'state',
    'code_challenge',
    'code_challenge_method'
] as const satisfies readonly (keyof AuthorizationRequest)[];

export function readAuthorizationRequest(search: string): AuthorizationRequest | null {
    const params = new URLSearchParams(search);
    if (
        AUTHORIZATION_SEARCH_KEYS.some((key) => params.getAll(key).length > 1) ||
        params.get('response_type') !== 'code' ||
        params.get('code_challenge_method') !== 'S256'
    )
        return null;
    return {
        response_type: 'code',
        client_id: params.get('client_id') ?? '',
        redirect_uri: params.get('redirect_uri') ?? '',
        scope: params.get('scope') ?? '',
        state: params.get('state'),
        code_challenge: params.get('code_challenge') ?? '',
        code_challenge_method: 'S256'
    };
}
