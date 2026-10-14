import { describe, expect, test } from 'bun:test';

import { Route } from '#/routes/_app/buscar';

describe('loader da pesquisa pública', () => {
    test('carrega o catálogo da API sem exigir login', async () => {
        const paths = [];
        const catalog = { semesters: ['2026.2'], semester: '2026.2', total: 0, classrooms: [] };
        const result = await Route.options.loader({
            context: {
                queryClient: {
                    getQueryData: () => undefined,
                    query: async ({ queryKey }) => {
                        paths.push(queryKey[1]);
                        return catalog;
                    }
                }
            }
        });
        expect(paths).toEqual(['/public/classrooms/catalog']);
        expect(result).toEqual(catalog);
    });
});
