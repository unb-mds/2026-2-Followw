import type { components } from '@followw/core/queries/schema.gen.ts';

import { apiClient } from '@followw/core/queries/client.ts';
import { type SearchResult, searchQueryOptions } from '@followw/core/queries/search.ts';
import { expect, test } from 'bun:test';

import { meQueryOptions } from '#/queries/me';

import {
    describeSearchPage,
    noProfessors,
    noStatistics,
    paged,
    turma
} from '../../helpers/search-page';

describeSearchPage('Resultados da busca', (fixture) => {
    test('consulta a busca única ao pesquisar e esconde os cursos ao limpar o campo', async () => {
        fixture.courses = [
            {
                id: 1,
                sigaa_id: 100,
                degree: 'Bacharelado',
                name: 'CÁLCULO APLICADO',
                shift: null,
                unit: { id: 1, code: null, name: 'MATEMÁTICA' }
            }
        ];
        const page = fixture.renderPage();
        expect(fixture.requests).toHaveLength(0);
        fixture.testing.fireEvent.change(fixture.searchbox(page), { target: { value: 'calculo' } });
        await fixture.testing.waitFor(() =>
            expect(fixture.requests.map((url) => url.pathname)).toEqual(['/api/public/search'])
        );
        await page.findByRole('heading', { name: 'Cálculo Aplicado' });
        fixture.testing.fireEvent.change(fixture.searchbox(page), { target: { value: '' } });
        await fixture.testing.waitFor(() =>
            expect(page.queryByRole('region', { name: 'Cursos' }) === null).toBe(true)
        );
    });

    test.each(['abc', 'a'.repeat(32), 'Carlos Silva'])(
        'busca válida %s consulta e mostra resultados',
        async (q) => {
            const page = fixture.renderPage(`?q=${q}`);
            await fixture.testing.waitFor(() => expect(page.getByText('Cálculo 1')).toBeDefined());
            expect(
                fixture.requests
                    .find((r) => r.pathname.endsWith('/public/search'))
                    ?.searchParams.get('q')
            ).toBe(q);
        }
    );

    test('busca com filtro ativo e só docentes não avisa sobre turmas indisponíveis', async () => {
        fixture.scheduleResults.set('Carlos Silva', []);
        const page = fixture.renderPage('?q=Carlos+Silva&hideUnavailable=true');
        await page.findByRole('heading', { name: 'Docentes' });
        expect(page.queryByText('Nenhuma matéria disponível.')).toBeNull();
    });

    test('abas de categoria aparecem para visitantes', () => {
        const page = fixture.renderPage('?q=calculo');
        expect(page.getByRole('group', { name: 'Categoria da busca' })).toBeDefined();
        for (const name of ['Todos', 'Turmas', 'Cursos', 'Docentes', 'Estágios']) {
            expect(page.getByRole('button', { name })).toBeDefined();
        }
        expect(page.getByRole('button', { name: 'Todos' }).getAttribute('aria-pressed')).toBe(
            'true'
        );
        expect(page.queryByRole('button', { name: 'Obrigatórias' })).toBeNull();
    });

    test('cada aba mostra apenas a categoria escolhida e preserva o texto da busca', async () => {
        fixture.courses = [
            {
                id: 1,
                sigaa_id: 100,
                degree: 'Bacharelado',
                name: 'ESTUDOS CARLOS SILVA',
                shift: null,
                unit: { id: 1, code: null, name: 'UNIDADE' }
            }
        ];
        const page = fixture.renderPage('?q=Carlos Silva');
        const tab = (name: string) => page.getByRole('button', { name });
        await page.findByRole('heading', { name: 'Docentes' });
        await page.findByText('Cálculo 1');
        expect(page.getByRole('heading', { name: 'Estudos Carlos Silva' })).toBeDefined();
        fixture.testing.fireEvent.click(tab('Turmas'));
        await fixture.testing.waitFor(() =>
            expect(page.queryByRole('heading', { name: 'Docentes' })).toBeNull()
        );
        expect(page.queryByRole('region', { name: 'Cursos' })).toBeNull();
        expect(page.getByText('Cálculo 1')).toBeDefined();
        expect(fixture.updates.at(-1)?.searchParams.get('category')).toBe('classrooms');
        fixture.testing.fireEvent.click(tab('Cursos'));
        await page.findByRole('heading', { name: 'Estudos Carlos Silva' });
        expect(page.queryByText('Cálculo 1')).toBeNull();
        expect(page.queryByRole('heading', { name: 'Docentes' })).toBeNull();
        fixture.testing.fireEvent.click(tab('Docentes'));
        await page.findByRole('heading', { name: 'Docentes' });
        expect(page.queryByRole('region', { name: 'Cursos' })).toBeNull();
        expect(page.queryByText('Cálculo 1')).toBeNull();
        expect(fixture.updates.at(-1)?.searchParams.get('q')).toBe('Carlos Silva');
        fixture.testing.fireEvent.click(tab('Todos'));
        await page.findByText('Cálculo 1');
        expect(page.getByRole('heading', { name: 'Estudos Carlos Silva' })).toBeDefined();
        expect(page.getByRole('heading', { name: 'Docentes' })).toBeDefined();
        expect(fixture.updates.at(-1)?.searchParams.has('category')).toBe(false);
    });

    test('aba Todos com texto faz uma única requisição à busca', async () => {
        const page = fixture.renderPage('?q=Carlos Silva');
        await page.findByRole('heading', { name: 'Docentes' });
        await fixture.testing.act(() => new Promise((resolve) => setTimeout(resolve, 350)));
        expect(fixture.requests.map((url) => url.pathname)).toEqual(['/api/public/search']);
        expect(fixture.requests[0].searchParams.getAll('type')).toEqual([]);
    });

    test('aba Todos sem resultados mostra uma única mensagem', async () => {
        fixture.client.setQueryData(searchQueryOptions('nada').queryKey, {
            subjects: paged([]),
            courses: paged([]),
            professors: noProfessors
        });
        const page = fixture.renderPage('?q=nada');
        expect(page.getByText('Nenhum resultado encontrado. Tente mudar a busca.')).toBeDefined();
        expect(page.queryByText(/Nenhuma matéria|Nenhum curso|Nenhum docente/)).toBeNull();
    });

    test.each([
        ['courses', 'Nenhum curso encontrado. Tente mudar a busca.'],
        ['professors', 'Nenhum docente encontrado. Tente mudar a busca.']
    ])(
        'categoria %s informa ausência de resultados sem consultar turmas',
        async (category, message) => {
            const page = fixture.renderPage(`?q=calculo&category=${category}`);
            await page.findByText(message);
            expect(page.queryByText('Cálculo 1')).toBeNull();
        }
    );

    test('aba Turmas sem resultados informa ausência de matérias', async () => {
        fixture.client.setQueryData(searchQueryOptions('nada', ['subjects']).queryKey, {
            subjects: paged([]),
            courses: null,
            professors: null
        });
        const page = fixture.renderPage('?q=nada&category=classrooms');
        expect(page.getByText('Nenhuma matéria encontrada. Tente mudar a busca.')).toBeDefined();
    });

    test('recomendações continuam em Todos e Turmas e não aparecem nas outras categorias', async () => {
        const user: components['schemas']['UserProfile'] = {
            name: 'Discente',
            registration: '1',
            photo: null,
            bio: null,
            unit: null,
            course: null,
            entry_semester: null,
            integralization: null,
            workload: null,
            period_max_workload: null,
            ira: null,
            mp: null,
            level: 'Graduação'
        };
        fixture.client.setQueryData(meQueryOptions.queryKey, user);
        const classrooms = [{ number: '01', semester: '2026.2', professors: [] }];
        fixture.recommended = [
            { code: 'MAT0025', name: 'Cálculo 1', kind: 'mandatory', classrooms },
            { code: 'MAT0029', name: 'Cálculo 9', kind: 'optional', classrooms }
        ];
        const page = fixture.renderPage();
        await page.findByText('Cálculo 1');
        expect(page.getByText('Cálculo 9')).toBeDefined();
        fixture.testing.fireEvent.click(page.getByRole('button', { name: 'Turmas' }));
        await page.findByRole('region', { name: 'Matérias recomendadas' });
        fixture.testing.fireEvent.click(page.getByRole('button', { name: 'Cursos' }));
        await fixture.testing.waitFor(() =>
            expect(page.queryByRole('region', { name: 'Matérias recomendadas' })).toBeNull()
        );
        await page.findByText('Nenhum curso cadastrado.');
        fixture.testing.fireEvent.click(page.getByRole('button', { name: 'Docentes' }));
        await page.findByRole('region', { name: 'Docentes' });
        expect(page.queryByText('Cálculo 1')).toBeNull();
        expect(fixture.requests.every((url) => !url.searchParams.has('q'))).toBe(true);
    });

    test('falha na busca única mostra um só carregamento e um só erro em Todos', async () => {
        apiClient.eject(fixture.middleware);
        fixture.middleware = {
            onRequest: ({ request }) => {
                fixture.requests.push(new URL(request.url));
                throw new Error('Sem conexão');
            }
        };
        apiClient.use(fixture.middleware);
        const page = fixture.renderPage('?q=Carlos Silva');
        expect(page.getAllByText('Buscando...')).toHaveLength(1);
        await page.findByText('Não foi possível buscar.');
        expect(page.queryByText(/Não foi possível buscar (as|os)/)).toBeNull();
        expect(page.queryByRole('heading', { name: 'Docentes' })).toBeNull();
        expect(page.queryByRole('region', { name: 'Cursos' })).toBeNull();
        expect(fixture.requests.map((url) => url.pathname)).toEqual(['/api/public/search']);
    });

    test('Mostrar mais consulta a página seguinte no servidor', async () => {
        const subjects = Array.from({ length: 30 }, (_, index) => ({
            code: `MAT${String(index).padStart(4, '0')}`,
            name: `Matéria ${index}`,
            classrooms: [turma('01', '2M1')]
        }));
        fixture.scheduleResults.set('materia', subjects);
        const page = fixture.renderPage('?q=materia');
        const items = () => page.container.querySelectorAll('[data-slot="accordion-item"]');
        await fixture.testing.waitFor(() => expect(items()).toHaveLength(25));
        fixture.testing.fireEvent.click(page.getByRole('button', { name: 'Mostrar mais' }));
        await fixture.testing.waitFor(() => expect(items()).toHaveLength(30));
        expect(fixture.requests).toHaveLength(2);
        expect(fixture.requests[1].pathname).toBe('/api/public/subjects');
        expect(Object.fromEntries(fixture.requests[1].searchParams)).toEqual({
            q: 'materia',
            offered: 'true',
            page: '2'
        });
        expect(page.queryByRole('button', { name: 'Mostrar mais' })).toBeNull();
    });

    test('abrir detalhes atualiza no cache os nomes ausentes dos requisitos', async () => {
        const name = 'MÉTODOS DE DESENVOLVIMENTO DE SOFTWARE';
        const saved = {
            code: 'FGA0173',
            name: 'INTERAÇÃO HUMANO COMPUTADOR',
            hours: 60,
            prerequisites: [
                [{ code: 'FGA0138', subject: null }],
                [{ code: 'FGA0312', subject: { code: 'FGA0312', name } }]
            ],
            classrooms: [{ number: '01', semester: '2026.2', professors: [] }]
        };
        const options = searchQueryOptions('FGA0173');
        fixture.client.setQueryData(options.queryKey, {
            subjects: paged([saved]),
            courses: paged([]),
            professors: noProfessors
        });
        apiClient.eject(fixture.middleware);
        fixture.middleware = {
            onRequest: ({ request }) => {
                const url = new URL(request.url);
                if (url.pathname.endsWith('/statistics')) return Response.json(noStatistics);
                fixture.requests.push(url);
                return Response.json({
                    subjects: paged([
                        {
                            ...saved,
                            prerequisites: [
                                [{ code: 'FGA0138', subject: { code: 'FGA0138', name } }],
                                ...saved.prerequisites.slice(1)
                            ]
                        }
                    ]),
                    courses: paged([]),
                    professors: noProfessors
                });
            }
        };
        apiClient.use(fixture.middleware);
        const page = fixture.renderPage('?q=FGA0173');
        expect(fixture.requests).toHaveLength(0);

        fixture.testing.fireEvent.click(page.getByRole('button', { name: /FGA0173/ }));
        const trigger = await page.findByRole('button', { name: 'Detalhes da turma 01' });
        fixture.testing.fireEvent.click(trigger);

        await fixture.testing.waitFor(() =>
            expect(
                fixture.client.getQueryData<SearchResult>(options.queryKey)?.subjects?.items
            ).toEqual([
                {
                    ...saved,
                    prerequisites: [
                        [{ code: 'FGA0138', subject: { code: 'FGA0138', name } }],
                        [{ code: 'FGA0312', subject: { code: 'FGA0312', name } }]
                    ]
                }
            ])
        );
        expect(fixture.requests).toHaveLength(1);
        expect(fixture.requests[0].searchParams.get('q')).toBe('FGA0173');
        fixture.testing.fireEvent.click(trigger);
        expect(fixture.requests).toHaveLength(1);
    });

    test('exibe docentes no topo antes das turmas quando houver professor correspondente', async () => {
        const page = fixture.renderPage('?q=Carlos Silva');
        await fixture.testing.waitFor(() =>
            expect(page.getByRole('heading', { name: 'Docentes' })).toBeDefined()
        );
        await fixture.testing.waitFor(() => expect(page.getByText('Cálculo 1')).toBeDefined());
        const docentes = page.getByRole('heading', { name: 'Docentes' });
        const materias = page.getByText('Cálculo 1');
        // Prioridade pré-estabelecida: a seção de matérias segue a seção de docentes
        expect(docentes.compareDocumentPosition(materias)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    test('buscar código depois de um nome esconde os docentes da busca anterior', async () => {
        const page = fixture.renderPage('?q=Carlos Silva');
        await page.findByText('Docentes', { selector: 'h2' });

        fixture.testing.fireEvent.change(fixture.searchbox(page), { target: { value: 'MAT0023' } });
        await fixture.testing.waitFor(() => {
            expect(Boolean(page.queryByText('Docentes', { selector: 'h2' }))).toBe(false);
            expect(Boolean(page.queryByText('Cálculo 1'))).toBe(true);
        });
    });
});
