import { expect, test } from 'bun:test';

import { allClassroomsQueryOptions } from '#/queries/classrooms';
import { curriculumQueryOptions } from '#/queries/curriculum';
import { Route } from '#/routes/_app/perfil_.simulador';

import { fakeQueryClient, runLoader } from '../helpers/route';

test('carrega o histórico e a revisão de matriz vinculada ao aluno', async () => {
    const keys: unknown[] = [];
    const queryClient = fakeQueryClient((key) => {
        keys.push(key);
        return key[1] === '/me'
            ? {
                  level: 'Graduação',
                  course: { id: 42 },
                  entry_semester: '2024.2',
                  curriculum_sigaa_id: 7
              }
            : [];
    });
    await runLoader(Route, { context: { queryClient } });
    expect(keys).toContainEqual(allClassroomsQueryOptions.queryKey);
    expect(keys).toContainEqual(curriculumQueryOptions(42, '2024.2', 7).queryKey);
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
