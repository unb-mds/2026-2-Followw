import { describe, expect, test } from 'bun:test';

import { Route as ProfileRoute } from '#/routes/_app/perfil';
import { Route as LoginRoute } from '#/routes/login';

function contextWithUser(user) {
    return {
        context: { queryClient: { query: async () => user } }
    };
}

describe('navegação de autenticação', () => {
    test('uma sessão ativa que abre o login segue para a Home', async () => {
        await expect(
            LoginRoute.options.loader(contextWithUser({ name: 'Estudante' }))
        ).rejects.toMatchObject({
            options: { to: '/' }
        });
    });

    test('o perfil sem sessão segue para a página de login', async () => {
        await expect(ProfileRoute.options.loader(contextWithUser(null))).rejects.toMatchObject({
            options: { to: '/login' }
        });
    });
});
