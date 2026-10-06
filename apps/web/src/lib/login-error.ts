import { ApiError } from '#/queries/errors';

export function loginErrorMessage(online: boolean, error: unknown) {
    if (!online) return 'Sem conexão. Conecte-se à internet para entrar.';
    if (!error) return undefined;
    if (error instanceof ApiError && error.isUnauthorized) return 'Matrícula ou senha incorretas.';
    return 'Não foi possível conectar ao SIGAA. Tente novamente.';
}
