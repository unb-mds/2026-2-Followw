import { allClassroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { expect, test } from 'bun:test';

import { meQueryOptions } from '#/queries/me';
import { Route } from '#/routes/_app/perfil_.simulador';

import { fakeQueryClient, runLoader } from '../helpers/route';

test('carrega o perfil e o histórico para usar a matriz vinculada ao aluno', async () => {
    const keys: unknown[] = [];
    const queryClient = fakeQueryClient((key) => {
        keys.push(key);
        return key[1] === '/me'
            ? {
                  level: 'Graduação',
                  curriculum_subject_codes: ['MAT0001']
              }
            : [];
    });
    await runLoader(Route, { context: { queryClient } });
    expect(keys).toEqual([meQueryOptions.queryKey, allClassroomsQueryOptions.queryKey]);
});

test('solicita login antes de consultar o histórico de turmas', async () => {
    const paths: unknown[] = [];
    const queryClient = fakeQueryClient((key) => {
        paths.push(key[1]);
        return null;
    });
    const error = await runLoader(Route, { context: { queryClient } }).catch(
        (caught: unknown) => caught
    );
    expect(error).toMatchObject({ options: { to: '/login' } });
    expect(paths).toEqual(['/me']);
});
