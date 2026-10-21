import { describe, expect, test } from 'bun:test';

import { Route as ProfileRoute } from '#/routes/_app/perfil';

import { fakeQueryClient, runLoader } from '../helpers/route';

describe('navegação de autenticação', () => {
    test('o perfil sem sessão segue para a página de login', async () => {
        const context = { context: { queryClient: fakeQueryClient(() => null) } };

        const redirect = await runLoader(ProfileRoute, context).catch((error: unknown) => error);

        expect(redirect).toMatchObject({ options: { to: '/login' } });
    });
});
