import { describe, expect, test } from 'bun:test';

import { Route as ProfileRoute } from '#/routes/_app/perfil';
import { Route as LoginRoute } from '#/routes/login';

import { fakeQueryClient, runLoader } from '../helpers/route';

function contextWithUser(user: { name: string } | null) {
    return { context: { queryClient: fakeQueryClient(() => user) } };
}

describe('navegação de autenticação', () => {
    test('uma sessão ativa que abre o login segue para a Home', async () => {
        const redirect = await runLoader(LoginRoute, contextWithUser({ name: 'Estudante' })).catch(
            (error: unknown) => error
        );
        expect(redirect).toMatchObject({ options: { to: '/' } });
    });

    test('o perfil sem sessão segue para a página de login', async () => {
        const redirect = await runLoader(ProfileRoute, contextWithUser(null)).catch(
            (error: unknown) => error
        );
        expect(redirect).toMatchObject({ options: { to: '/login' } });
    });
});
