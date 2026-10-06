import { describe, expect, test } from 'bun:test';

import { loginErrorMessage } from '#/lib/login-error';
import { ApiError } from '#/queries/errors';

describe('loginErrorMessage', () => {
    test('offline vence qualquer outro erro', () => {
        expect(loginErrorMessage(false, new ApiError(401, 'x'))).toContain('Sem conexão');
    });

    test('sem erro não há mensagem', () => {
        expect(loginErrorMessage(true, null)).toBeUndefined();
    });

    test('401 é credencial incorreta', () => {
        expect(loginErrorMessage(true, new ApiError(401, 'x'))).toBe(
            'Matrícula ou senha incorretas.'
        );
    });

    test('outras falhas são indisponibilidade do SIGAA', () => {
        expect(loginErrorMessage(true, new ApiError(502, 'x'))).toContain('conectar ao SIGAA');
        expect(loginErrorMessage(true, new TypeError('fetch failed'))).toContain(
            'conectar ao SIGAA'
        );
    });
});
