import type { Middleware } from 'openapi-fetch';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { afterEach, describe, expect, test } from 'bun:test';

import type { ProfessorDetails } from '#/queries/professors';

import { apiClient } from '#/queries/client';
import { toApiError } from '#/queries/errors';
import { meQueryOptions } from '#/queries/me';
import { professorQueryOptions } from '#/queries/professors';
import { Route } from '#/routes/_app/professores_.$siape';
import { routeTree } from '#/routeTree.gen';

import { useDom } from '../helpers/dom';
import { fakeQueryClient, runLoader } from '../helpers/route';

const dom = useDom('http://localhost/professores/1234567');

const mockProfessor: ProfessorDetails = {
    siape: 1234567,
    name: 'EDSON ALVES DA SILVA',
    unit: {
        id: 673,
        code: 'FCTE',
        name: 'CAMPUS UNB GAMA: FACULDADE DE CIÊNCIAS E TECNOLOGIAS EM ENGENHARIA - BRASÍLIA'
    },
    photo: 'https://sigaa.unb.br/foto-edson.jpg',
    url: 'https://sigaa.unb.br/perfil?siape=1234567',
    description: 'Docente da Faculdade UnB Gama com foco em maratona de programação.',
    interests: 'Algoritmos, Estruturas de Dados e Teoria dos Grafos.',
    lattes: 'http://lattes.cnpq.br/1234567890',
    email: 'edsonalves@unb.br',
    education: [
        {
            level: 'DOUTORADO',
            course: 'Ciência da Computação',
            institution: 'Universidade de Brasília',
            start_year: '2012',
            end_year: '2016'
        }
    ],
    disciplines: [
        {
            semester: '2026.2',
            code: 'FGA0003',
            occurrences: 2,
            name: 'COMPILADORES 1'
        }
    ]
};

describe('rota de perfil do professor (/professores/$siape)', () => {
    test('loader pré-carrega o nome do professor para o título da página', async () => {
        const queryClient = fakeQueryClient((key) => {
            if (key[1] === '/public/professors/{siape}') {
                return mockProfessor;
            }
            return null;
        });

        const data = await runLoader(Route, {
            params: { siape: 1234567 },
            location: { searchStr: '' },
            context: { queryClient }
        });

        expect(data.professorName).toBe('EDSON ALVES DA SILVA');
    });

    test('renderiza cabeçalho, dados de contato e seções detalhadas', async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { staleTime: Infinity } }
        });
        queryClient.setQueryData(meQueryOptions.queryKey, null);
        queryClient.setQueryData(professorQueryOptions(1234567).queryKey, mockProfessor);

        const router = createRouter({
            routeTree,
            history: createMemoryHistory({ initialEntries: ['/professores/1234567'] }),
            context: { queryClient }
        });
        await router.load();

        const page = dom.testing.render(
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        );

        await dom.testing.waitFor(() => {
            expect(page.container.innerHTML).toContain('Edson Alves da Silva');
        });
        const html = page.container.innerHTML;

        // Nome formatado com titleCase
        expect(html).toContain('Edson Alves da Silva');
        // Unidade formatada e simplificada (sem badge redundante)
        expect(html).toContain('FCTE · Campus UnB Gama');
        // E-mail e Lattes
        expect(html).toContain('edsonalves@unb.br');
        expect(html).toContain('http://lattes.cnpq.br/1234567890');
        // Formação acadêmica
        expect(html).toContain('Doutorado');
        expect(html).toContain('Ciência da Computação');
        // Disciplinas ministradas
        expect(html).toContain('COMPILADORES 1');
        expect(html).toContain('2026.2');
        expect(html).toContain('2 turmas');
        expect(html).toContain('href="/buscar?q=FGA0003"');
    });

    describe('sem dado do docente', () => {
        let middleware: Middleware;
        let requests: string[];

        afterEach(() => apiClient.eject(middleware));

        function renderAt(path: string, status = 404) {
            requests = [];
            middleware = {
                // lança como o client faz; um Response aqui pularia o onResponse que cria o ApiError
                onRequest: ({ request }) => {
                    requests.push(request.url);
                    throw toApiError(status, { detail: 'Erro' });
                }
            };
            apiClient.use(middleware);
            const queryClient = new QueryClient({
                defaultOptions: { queries: { retry: false, staleTime: Infinity } }
            });
            queryClient.setQueryData(meQueryOptions.queryKey, null);
            const router = createRouter({
                routeTree,
                history: createMemoryHistory({ initialEntries: [path] }),
                context: { queryClient }
            });
            return dom.testing.render(
                <QueryClientProvider client={queryClient}>
                    <RouterProvider router={router} />
                </QueryClientProvider>
            );
        }

        test('404 da API exibe a página não encontrada', async () => {
            const page = renderAt('/professores/99999');
            await dom.testing.waitFor(() => {
                expect(page.container.innerHTML).toContain('Essa página se perdeu.');
            });
        });

        test.each(['abc', '1.5', '0', '2147483648'])(
            'SIAPE inválido (%s) exibe a página não encontrada sem chamar a API',
            async (siape) => {
                const page = renderAt(`/professores/${siape}`);
                await dom.testing.waitFor(() => {
                    expect(page.container.innerHTML).toContain('Essa página se perdeu.');
                });
                expect(requests).toEqual([]);
            }
        );

        test('falha da API exibe erro com nova tentativa', async () => {
            const page = renderAt('/professores/99999', 502);
            await dom.testing.waitFor(() => {
                expect(page.container.innerHTML).not.toContain('Essa página se perdeu.');
                expect(page.getByRole('button', { name: /tentar/i })).toBeDefined();
            });
        });
    });
});
