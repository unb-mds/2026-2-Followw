import { expect, test } from 'bun:test';

import { Route } from '#/routes/_app/avaliacao-institucional';

import { fakeQueryClient, runLoader } from '../helpers/route';

function loadEvaluations(ids: readonly number[], view?: 'list') {
    return runLoader(Route, {
        context: {
            queryClient: fakeQueryClient((key) =>
                key[1] === '/me'
                    ? { registration: '251000000' }
                    : ids.map((sigaa_id) => ({ sigaa_id }))
            )
        },
        location: { href: '/avaliacao-institucional' },
        deps: { view }
    });
}

test('abre direto o questionário quando há uma única avaliação disponível', async () => {
    expect(await loadEvaluations([7]).catch((error: unknown) => error)).toMatchObject({
        options: {
            to: '/avaliacao-institucional/$id',
            params: { id: 7 },
            replace: true
        }
    });
});

test('exibe a lista ao voltar do questionário mesmo com uma única avaliação', async () => {
    expect(await loadEvaluations([7], 'list')).toBeUndefined();
});

test.each([{ ids: [] }, { ids: [7, 8] }])('exibe a lista para %p', async ({ ids }) => {
    expect(await loadEvaluations(ids)).toBeUndefined();
});
