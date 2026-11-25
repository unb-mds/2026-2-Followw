import { searchQueryOptions } from '@followw/core/queries/search.ts';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';

import {
    describeSearchPage,
    makeSearchRouter,
    noProfessors,
    paged
} from '../../helpers/search-page';

describeSearchPage('URL da busca', (fixture) => {
    test('abre um link com horário composto e filtros com o cache vazio', async () => {
        fixture.client.clear();
        fixture.scheduleResults.set('6T6 6N1', [
            {
                code: 'ADM0002',
                name: 'Administração',
                classrooms: [
                    { number: '01', semester: '2026.2', schedule: '6T6 6N1', professors: [] }
                ]
            }
        ]);
        const page = fixture.renderPage('?q=6T6+6N1&unit=ADM&days=4&hours=60');
        // `unit` não é estado da busca: a URL ignora o parâmetro.
        expect(await page.findByRole('button', { name: /ADM0002/ })).toBeDefined();
        expect(fixture.searchbox(page).value).toBe('6T6 6N1');
        expect(fixture.requests.map((url) => url.pathname)).toEqual([
            '/api/me',
            '/api/public/subjects'
        ]);
        expect(Object.fromEntries(fixture.requests[1].searchParams)).toEqual({
            q: '6T6 6N1',
            days: '4',
            hours: '60',
            offered: 'true'
        });
    });

    test('URL direta preenche campo e carrega resultados', async () => {
        const page = fixture.renderPage('?q=calculo');
        expect(fixture.searchbox(page).value).toBe('calculo');
        await fixture.testing.waitFor(() => expect(page.getByText('Cálculo 1')).toBeDefined());
        expect(fixture.requests[0].searchParams.get('q')).toBe('calculo');
    });

    test.each(['ab', 'a'.repeat(33)])('URL com query inválida %s não chama a API', async (q) => {
        const page = fixture.renderPage(`?q=${q}`);
        expect(fixture.searchbox(page).value).toBe(q);
        await fixture.testing.act(() => new Promise((resolve) => setTimeout(resolve, 350)));
        expect(fixture.requests).toHaveLength(0);
    });

    test('digitação atualiza a URL imediatamente e a API após o debounce', async () => {
        const page = fixture.renderPage();
        const input = fixture.searchbox(page);
        fixture.testing.fireEvent.change(input, { target: { value: 'ab' } });
        await fixture.testing.waitFor(() =>
            expect(fixture.updates.at(-1)?.searchParams.get('q')).toBe('ab')
        );
        expect(fixture.requests).toHaveLength(0);
        fixture.testing.fireEvent.change(input, { target: { value: 'Carlos Silva' } });
        expect(input.value).toBe('Carlos Silva');
        expect(fixture.requests).toHaveLength(0);
        await fixture.testing.waitFor(() =>
            expect(
                fixture.requests.filter((r) => r.pathname.endsWith('/public/search'))
            ).toHaveLength(1)
        );
        expect(
            fixture.requests
                .find((r) => r.pathname.endsWith('/public/search'))
                ?.searchParams.get('q')
        ).toBe('Carlos Silva');
        fixture.testing.fireEvent.change(input, { target: { value: '' } });
        await fixture.testing.waitFor(() =>
            expect(fixture.updates.at(-1)?.searchParams.has('q')).toBe(false)
        );
    });

    test('query inválida mantém os resultados da última busca', async () => {
        const page = fixture.renderPage('?q=calculo');
        await fixture.testing.waitFor(() => expect(page.getByText('Cálculo 1')).toBeDefined());
        fixture.testing.fireEvent.change(fixture.searchbox(page), { target: { value: 'ca' } });
        await fixture.testing.act(() => new Promise((resolve) => setTimeout(resolve, 350)));
        expect(page.getByText('Cálculo 1')).toBeDefined();
        expect(page.queryByText(/Para buscar pelo início da aula/)).toBeNull();
        expect(fixture.requests.filter((r) => r.pathname.endsWith('/public/search'))).toHaveLength(
            1
        );
    });

    test('campo impede ou trunca caracteres acima de 32', async () => {
        const page = fixture.renderPage();
        const input = fixture.searchbox(page);
        expect(input.maxLength).toBe(32);
        fixture.testing.fireEvent.change(input, { target: { value: 'a'.repeat(33) } });
        expect(input.value).toBe('a'.repeat(32));
        await fixture.testing.waitFor(() =>
            expect(
                fixture.requests.filter((r) => r.pathname.endsWith('/public/search'))
            ).toHaveLength(1)
        );
        expect(
            fixture.requests
                .find((r) => r.pathname.endsWith('/public/search'))
                ?.searchParams.get('q')
        ).toHaveLength(32);
    });

    test('limpar o filtro remove seu parâmetro e preserva a consulta', async () => {
        const page = fixture.renderPage('?q=calculo&category=courses');
        fixture.testing.fireEvent.click(page.getByRole('button', { name: 'Limpar categoria' }));
        await fixture.testing.waitFor(() =>
            expect(fixture.updates.at(-1)?.searchParams.has('category')).toBe(false)
        );
        expect(fixture.updates.at(-1)?.searchParams.get('q')).toBe('calculo');
        await fixture.testing.waitFor(() => expect(page.getByText('2 turmas')).toBeDefined());
    });

    test.each([
        ['classrooms', 'subjects'],
        ['courses', 'courses'],
        ['professors', 'professors']
    ] as const)('URL direta da categoria %s busca somente o tipo %s', async (category, type) => {
        const page = fixture.renderPage(`?q=Carlos Silva&category=${category}`);
        await fixture.testing.waitFor(() => expect(fixture.requests.length).toBe(1));
        expect(fixture.requests[0].pathname).toBe('/api/public/search');
        expect(fixture.requests[0].searchParams.getAll('type')).toEqual([type]);
        expect(
            page
                .getByRole('button', {
                    name: { classrooms: 'Turmas', courses: 'Cursos', professors: 'Docentes' }[
                        category
                    ]
                })
                .getAttribute('aria-pressed')
        ).toBe('true');
    });

    test('adaptador real hidrata a URL e acompanha digitação e navegação do Router', async () => {
        fixture.client.setQueryData(searchQueryOptions('calculo').queryKey, {
            subjects: paged([
                {
                    code: 'MAT0023',
                    name: 'Cálculo 1',
                    classrooms: [{ number: '01', semester: '2026.2', professors: [] }]
                }
            ]),
            courses: paged([]),
            professors: noProfessors
        });
        const server = makeSearchRouter(true);
        await server.load();
        const container = document.createElement('div');
        container.innerHTML = renderToString(
            <QueryClientProvider client={fixture.client}>
                <RouterProvider router={server} />
            </QueryClientProvider>
        );
        document.body.append(container);
        expect(container.querySelector('input')?.value).toBe('calculo');
        const router = makeSearchRouter(false);
        await router.load();
        const errors: string[] = [];
        const page = fixture.testing.render(
            <QueryClientProvider client={fixture.client}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
            {
                container,
                hydrate: true,
                onRecoverableError: (error) => errors.push(String(error))
            }
        );
        expect(errors).toEqual([]);
        fixture.testing.fireEvent.change(fixture.searchbox(page), {
            target: { value: 'Carlos Silva' }
        });
        await fixture.testing.waitFor(() =>
            expect(router.state.location.search.q).toBe('Carlos Silva')
        );
        await fixture.testing.act(() =>
            router.navigate({ to: '/buscar', search: { q: 'calculo' } })
        );
        expect(fixture.searchbox(page).value).toBe('calculo');
        fixture.testing.fireEvent.click(page.getByRole('button', { name: 'Filtros de matérias' }));
        const filters = fixture.testing.within(document.body);
        fixture.testing.fireEvent.click(await filters.findByRole('button', { name: '08:00' }));
        fixture.testing.fireEvent.click(filters.getByRole('button', { name: '10:00' }));
        await fixture.testing.waitFor(() =>
            expect(new URLSearchParams(router.state.location.searchStr).getAll('start')).toEqual([
                '08:00',
                '10:00'
            ])
        );
        expect(errors).toEqual([]);
    });
});
