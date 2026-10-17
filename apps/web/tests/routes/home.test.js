import { describe, expect, test } from 'bun:test';

import { Route } from '#/routes/_app/index';

describe('tela inicial preservada', () => {
    test.each([null, { level: 'Graduação', unity: 'FCTE' }])(
        'não consulta recomendações com perfil %p',
        async (user) => {
            const paths = [];
            await Route.options.loader({
                context: {
                    queryClient: {
                        getQueryData: () => undefined,
                        query: async ({ queryKey }) => {
                            paths.push(queryKey[1]);
                            return queryKey[1] === '/me' ? user : [];
                        }
                    }
                }
            });
            expect(paths).toContain('/public/restaurant');
            expect(paths).not.toContain('/me/recommendations');
            expect(paths.includes('/classrooms')).toBe(Boolean(user));
        }
    );
});
