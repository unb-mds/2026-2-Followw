import { OFFLINE_MESSAGE } from '@followw/core/lib/online.ts';
import { ApiError } from '@followw/core/queries/errors.ts';

import { SessionNotStoredError } from '@/queries/auth';

export const REGISTRATION_LENGTH = 9;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 64;

/** Mensagem do primeiro campo inválido, ou null se a tentativa pode ir à API. */
export function validateLogin(registration: string, password: string): string | null {
    if (!new RegExp(`^\\d{${REGISTRATION_LENGTH}}$`).test(registration))
        return `A matrícula tem ${REGISTRATION_LENGTH} dígitos.`;
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)
        return `A senha deve ter entre ${PASSWORD_MIN} e ${PASSWORD_MAX} caracteres.`;
    return null;
}

function waitLabel(seconds: number): string {
    if (seconds < 60) return `${Math.max(1, seconds)} segundos`;
    const minutes = Math.ceil(seconds / 60);
    return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
}

export function loginErrorMessage(error: unknown, online: boolean): string | undefined {
    if (!online) return OFFLINE_MESSAGE;
    if (!error) return undefined;
    if (error instanceof ApiError && error.isUnauthorized) return 'Matrícula ou senha incorretas.';
    if (error instanceof ApiError && error.isTooManyRequests)
        return error.retryAfter
            ? `Muitas tentativas de login. Tente novamente em ${waitLabel(error.retryAfter)}.`
            : 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.';
    if (error instanceof SessionNotStoredError)
        return 'Não foi possível guardar a sessão neste aparelho. Tente novamente.';
    return 'Não foi possível conectar ao SIGAA. Tente novamente.';
}
