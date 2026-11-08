import { ApiError } from '@followw/core/queries/errors.ts';

import { loginErrorMessage, validateLogin } from '@/lib/login';
import { SessionNotStoredError } from '@/queries/auth';

describe('validateLogin', () => {
    test('aceita matrícula de 9 dígitos e senha de 6 a 64 caracteres', () => {
        expect(validateLogin('123456789', 'abcdef')).toBeNull();
        expect(validateLogin('123456789', 'a'.repeat(64))).toBeNull();
    });

    test.each(['', '12345678', '1234567890', '12345678a'])(
        'recusa a matrícula %p',
        (registration) => {
            expect(validateLogin(registration, 'abcdef')).toBe('A matrícula tem 9 dígitos.');
        }
    );

    test.each(['', 'abcde', 'a'.repeat(65)])('recusa a senha de %p caracteres', (password) => {
        expect(validateLogin('123456789', password)).toBe(
            'A senha deve ter entre 6 e 64 caracteres.'
        );
    });
});

describe('loginErrorMessage', () => {
    test('sem conexão a mensagem é de offline, mesmo com outro erro', () => {
        expect(loginErrorMessage(new ApiError(401, null), false)).toBe(
            'Você está sem conexão com a internet.'
        );
    });

    test('sem erro não há mensagem', () => {
        expect(loginErrorMessage(null, true)).toBeUndefined();
    });

    test('401 vira credenciais incorretas', () => {
        expect(loginErrorMessage(new ApiError(401, null), true)).toBe(
            'Matrícula ou senha incorretas.'
        );
    });

    test.each([
        [30, 'Tente novamente em 30 segundos.'],
        [60, 'Tente novamente em 1 minuto.'],
        [90, 'Tente novamente em 2 minutos.']
    ])('429 com Retry-After de %is informa a espera', (seconds, expected) => {
        const message = loginErrorMessage(new ApiError(429, null, seconds), true);
        expect(message).toContain(expected);
    });

    test('429 sem Retry-After pede alguns minutos', () => {
        expect(loginErrorMessage(new ApiError(429, null), true)).toBe(
            'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.'
        );
    });

    test('sessão não guardada tem mensagem própria', () => {
        expect(loginErrorMessage(new SessionNotStoredError(), true)).toContain('guardar a sessão');
    });

    test('outras falhas são do SIGAA ou da rede', () => {
        expect(loginErrorMessage(new ApiError(502, null), true)).toBe(
            'Não foi possível conectar ao SIGAA. Tente novamente.'
        );
        expect(loginErrorMessage(new TypeError('Network request failed'), true)).toBe(
            'Não foi possível conectar ao SIGAA. Tente novamente.'
        );
    });
});
