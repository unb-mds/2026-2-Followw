import { describe, expect, test } from 'bun:test';

import { getCurrentSemester } from '#/calendar';
import { validateFlowSearch } from '#/lib/curriculum/navigation';
import { Route } from '#/routes/_app/cursos.$id';

import { callRoute, fakeQueryClient, runLoader } from '../helpers/route';

describe('rota de curso (/cursos/$id)', () => {
    test('valida a busca aceitando só a matéria selecionada', () => {
        expect(
            validateFlowSearch({
                materia: 'FGA0146',
                q: 'dados',
                curso: 99,
                returnTo: 'https://externo.test'
            })
        ).toEqual({ materia: 'FGA0146' });
        expect(validateFlowSearch({ materia: ['FGA0146'] })).toEqual({ materia: undefined });
        expect(validateFlowSearch({ materia: '../login' }).materia).toBeUndefined();
    });
    test('converte o ID do caminho para número e o serializa para navegação', () => {
        expect(callRoute(Route.options.params?.parse, { id: '152' })).toEqual({ id: 152 });
        expect(callRoute(Route.options.params?.stringify, { id: 152 })).toEqual({ id: '152' });
    });
    test.each(['-1', '0', '1.5', 'abc', '9007199254740992'])(
        'ID inválido no caminho (%s) retorna página não encontrada',
        (id) => {
            let error: unknown;
            try {
                callRoute(Route.options.params?.parse, { id });
            } catch (caught) {
                error = caught;
            }
            expect(error).toMatchObject({ isNotFound: true, routeId: '__root__' });
        }
    );
    test('loader usa o curso do caminho em vez do curso do aluno', async () => {
        const keys: unknown[] = [];
        await runLoader(Route, {
            params: { id: 99 },
            context: {
                queryClient: fakeQueryClient((key) => {
                    keys.push(key);
                    return key[1] === '/me' ? { course: { id: 42 }, entry_semester: '2024.2' } : [];
                })
            }
        });
        expect(keys).toContainEqual([
            'get',
            '/public/courses/{course_id}',
            { params: { path: { course_id: 99 } } }
        ]);
        expect(keys.some((key) => Array.isArray(key) && key[1] === '/classrooms')).toBe(false);
        expect(keys).toContainEqual([
            'get',
            '/public/courses/{course_id}/curriculum',
            {
                params: {
                    path: { course_id: 99 },
                    query: { entry_semester: getCurrentSemester()?.semester }
                }
            }
        ]);
    });
    test('curso do aluno usa seu ingresso e pré-carrega o histórico', async () => {
        const keys: unknown[] = [];
        await runLoader(Route, {
            params: { id: 42 },
            context: {
                queryClient: fakeQueryClient((key) => {
                    keys.push(key);
                    return key[1] === '/me' ? { course: { id: 42 }, entry_semester: '2024.2' } : [];
                })
            }
        });
        expect(keys).toContainEqual([
            'get',
            '/public/courses/{course_id}/curriculum',
            { params: { path: { course_id: 42 }, query: { entry_semester: '2024.2' } } }
        ]);
        expect(keys).toContainEqual([
            'get',
            '/classrooms',
            { params: { query: { semester: 'all' } } }
        ]);
    });
    test.each([null, { course: null, entry_semester: '2024.2' }])(
        'consulta o curso público do caminho sem exigir matrícula em um curso (%p)',
        async (user) => {
            const keys: unknown[] = [];
            await runLoader(Route, {
                params: { id: 99 },
                context: {
                    queryClient: fakeQueryClient((key) => {
                        keys.push(key);
                        return key[1] === '/me' ? user : [];
                    })
                }
            });
            expect(keys).toContainEqual([
                'get',
                '/public/courses/{course_id}',
                { params: { path: { course_id: 99 } } }
            ]);
            expect(keys).toContainEqual([
                'get',
                '/public/courses/{course_id}/curriculum',
                {
                    params: {
                        path: { course_id: 99 },
                        query: { entry_semester: getCurrentSemester()?.semester }
                    }
                }
            ]);
        }
    );
    test('sem ingresso do aluno não solicita sua matriz', async () => {
        const keys: unknown[] = [];
        await runLoader(Route, {
            params: { id: 42 },
            context: {
                queryClient: fakeQueryClient((key) => {
                    keys.push(key);
                    return { course: { id: 42 }, entry_semester: null };
                })
            }
        });
        expect(keys).toEqual([['get', '/me']]);
    });
    test('falha do histórico não bloqueia o carregamento da matriz', async () => {
        const keys: unknown[] = [];
        await runLoader(Route, {
            params: { id: 42 },
            context: {
                queryClient: fakeQueryClient((key) => {
                    keys.push(key);
                    if (key[1] === '/classrooms') throw new Error('Sem conexão');
                    return key[1] === '/me' ? { course: { id: 42 }, entry_semester: '2024.2' } : [];
                })
            }
        });
        expect(keys).toHaveLength(3);
    });
});
