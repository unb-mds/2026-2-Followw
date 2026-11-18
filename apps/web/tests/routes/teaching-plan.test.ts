import type { TeachingPlan } from '@followw/core/queries/classrooms.ts';
import type { QueryKey } from '@tanstack/react-query';

import { describe, expect, spyOn, test } from 'bun:test';

import { Route } from '#/routes/turmas_.$id_.plano-de-ensino';

import { fakeQueryClient, runLoader } from '../helpers/route';

const PLAN: TeachingPlan = {
    methodology: 'Aulas práticas.',
    assessment_procedures: null,
    office_hours: null,
    schedule: [],
    assessments: [],
    basic_references: [],
    complementary_references: []
};

function classroom(has_teaching_plan: boolean | null) {
    return { id: 'AAA', subject: { name: 'Matemática Discreta 2' }, has_teaching_plan };
}

function setup(respond: (key: QueryKey) => unknown) {
    const paths: unknown[] = [];
    const queryClient = fakeQueryClient((key) => {
        paths.push(key[1]);
        return respond(key);
    });
    const invalidate = spyOn(queryClient, 'invalidateQueries');
    const load = () => runLoader(Route, { context: { queryClient }, params: { id: 'AAA' } });
    return { paths, invalidate, load };
}

const account = (plan: unknown, has: boolean | null) => (key: QueryKey) => {
    if (key[1] === '/me') return { registration: '123' };
    if (key[1] === '/classrooms') return [classroom(has)];
    return plan;
};

describe('rota independente do plano de ensino', () => {
    test.each([true, null])('carrega o plano da turma com plano %p', async (has) => {
        const { paths, load } = setup(account(PLAN, has));
        const { classroom: loaded, plan } = await load();
        expect(loaded.subject.name).toBe('Matemática Discreta 2');
        expect(plan).toEqual(PLAN);
        expect(paths).toEqual(['/me', '/classrooms', '/classrooms/{classroom_id}/teaching-plan']);
    });

    test('turma sabidamente sem plano volta à turma sem consultar o plano', async () => {
        const { paths, load } = setup(account(PLAN, false));
        const error = await load().catch((reason: unknown) => reason);
        expect(error).toMatchObject({ options: { to: '/turmas/$id', params: { id: 'AAA' } } });
        expect(paths).toEqual(['/me', '/classrooms']);
    });

    test('plano ausente volta à turma e relê a lista para esconder o acesso', async () => {
        const { invalidate, load } = setup(account(null, null));
        const error = await load().catch((reason: unknown) => reason);
        expect(error).toMatchObject({ options: { to: '/turmas/$id', params: { id: 'AAA' } } });
        expect(invalidate).toHaveBeenCalledTimes(1);
    });

    test('sem login redireciona sem buscar plano', async () => {
        const { paths, load } = setup(() => null);
        const error = await load().catch((reason: unknown) => reason);
        expect(error).toMatchObject({ options: { to: '/login' } });
        expect(paths).toEqual(['/me']);
    });

    test('turma sem vínculo retorna não encontrado sem buscar plano', async () => {
        const { paths, load } = setup((key) => (key[1] === '/me' ? { registration: '123' } : []));
        const error = await load().catch((reason: unknown) => reason);
        expect(error).toMatchObject({ isNotFound: true });
        expect(paths).toEqual(['/me', '/classrooms']);
    });
});
