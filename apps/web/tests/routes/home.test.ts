import type { QueryKey } from '@tanstack/react-query';

import { describe, expect, test } from 'bun:test';

import { Route } from '#/routes/_app/index';

import { fakeQueryClient, runLoader } from '../helpers/route';

describe('tela inicial', () => {
    test.each([
        { user: null, expected: ['/me'] },
        {
            user: { level: 'Graduação', unit: { id: 673, code: 'FCTE', name: 'CAMPUS UNB GAMA' } },
            expected: ['/me', '/public/restaurant', '/classrooms']
        }
    ])(
        'carrega turmas e cardápio somente para o painel Hoje: $expected',
        async ({ user, expected }) => {
            const paths: QueryKey[number][] = [];
            const queryClient = fakeQueryClient(([, path]) => {
                paths.push(path);
                return path === '/me' ? user : [];
            });
            await runLoader(Route, { context: { queryClient } });
            expect(paths).toEqual([...expected]);
        }
    );
});
