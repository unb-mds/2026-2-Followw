import type { QueryKey } from '@tanstack/react-query';

import { describe, expect, test } from 'bun:test';

import { Route } from '#/routes/turmas_.$id_.plano-de-ensino';

import { fakeQueryClient, runLoader } from '../helpers/route';

const classroom = { id: 'AAA', subject: { name: 'Matemática Discreta 2' } };

function load(respond: (key: QueryKey) => unknown) {
    return runLoader(Route, {
        context: { queryClient: fakeQueryClient(respond) },
        params: { id: 'AAA' }
    });
}

describe('rota independente do plano de ensino', () => {
    test('carrega perfil, vínculo e plano sem consultar postagens', async () => {
        const paths: unknown[] = [];
        const result = await load((key) => {
            paths.push(key[1]);
            if (key[1] === '/me') return { registration: '123' };
            if (key[1] === '/classrooms') return [classroom];
            return { methodology: 'Aulas práticas.' };
        });
        expect(result).toEqual({ subjectName: 'Matemática Discreta 2' });
        expect(paths).toEqual(['/me', '/classrooms', '/classrooms/{classroom_id}/teaching-plan']);
    });

    test('redireciona ausência para Postagens sem renderizar página vazia', async () => {
        const error = await load((key) => {
            if (key[1] === '/me') return { registration: '123' };
            if (key[1] === '/classrooms') return [classroom];
            return null;
        }).catch((reason: unknown) => reason);
        expect(error).toMatchObject({
            options: { to: '/turmas/$id', params: { id: 'AAA' }, search: { tab: 'posts' } }
        });
    });

    test('sem login redireciona sem buscar plano', async () => {
        const paths: unknown[] = [];
        const error = await load((key) => {
            paths.push(key[1]);
            return null;
        }).catch((reason: unknown) => reason);
        expect(error).toMatchObject({ options: { to: '/login' } });
        expect(paths).toEqual(['/me']);
    });

    test('turma sem vínculo retorna não encontrado sem buscar plano', async () => {
        const paths: unknown[] = [];
        const error = await load((key) => {
            paths.push(key[1]);
            return key[1] === '/me' ? { registration: '123' } : [];
        }).catch((reason: unknown) => reason);
        expect(error).toMatchObject({ isNotFound: true });
        expect(paths).toEqual(['/me', '/classrooms']);
    });
});
