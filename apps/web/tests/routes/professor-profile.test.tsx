import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { describe, expect, test } from 'bun:test';

import type { ProfessorDetails } from '#/queries/professors';

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
            name: 'COMPILADORES 1',
            occurrences: 2
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
            params: { siape: '1234567' },
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
        expect(html).toContain('Compiladores 1');
        expect(html).toContain('FGA0003');
        expect(html).toContain('2026.2');
        expect(html).toContain('2 turmas');
    });

    test('exibe mensagem quando o docente não é encontrado', async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { staleTime: Infinity } }
        });
        queryClient.setQueryData(meQueryOptions.queryKey, null);
        queryClient.setQueryData(professorQueryOptions(99999).queryKey, null);

        const router = createRouter({
            routeTree,
            history: createMemoryHistory({ initialEntries: ['/professores/99999'] }),
            context: { queryClient }
        });
        await router.load();

        const page = dom.testing.render(
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        );

        await dom.testing.waitFor(() => {
            expect(page.container.innerHTML).toContain('Docente não encontrado.');
        });
    });
});
