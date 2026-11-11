import type { QueryKey } from '@tanstack/react-query';

import { describe, expect, test } from 'bun:test';

import { Route } from '#/routes/_app/index';

import { fakeQueryClient, runLoader } from '../helpers/route';

describe('tela inicial preservada', () => {
    test.each([
        null,
        { level: 'Graduação', unit: { id: 673, code: 'FCTE', name: 'CAMPUS UNB GAMA' } }
    ])('não consulta recomendações com perfil %p', async (user) => {
        const paths: QueryKey[number][] = [];
        await runLoader(Route, {
            context: {
                queryClient: fakeQueryClient((queryKey) => {
                    paths.push(queryKey[1]);
                    return queryKey[1] === '/me' ? user : [];
                })
            }
        });
        expect(paths).toContain('/public/restaurant');
        expect(paths).not.toContain('/me/recommendations');
        expect(paths.includes('/classrooms')).toBe(Boolean(user));
    });
});
