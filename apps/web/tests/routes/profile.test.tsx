import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRouter
} from '@tanstack/react-router';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { renderToStaticMarkup } from 'react-dom/server';

import type { components } from '#/queries/schema.gen';

import { meQueryOptions } from '#/queries/me';
import { settingsQueryOptions } from '#/queries/settings';
import { Route as AppRoute } from '#/routes/_app';
import { Route } from '#/routes/_app/perfil';

import { fakeQueryClient, runLoader } from '../helpers/route';

test('abre o Perfil sem esperar pelas preferências', async () => {
    const paths: unknown[] = [];
    const queryClient = fakeQueryClient((queryKey) => {
        const path = queryKey[1];
        paths.push(path);
        return path === '/me' ? { registration: '202600001' } : {};
    });
    await runLoader(AppRoute, { context: { queryClient } });
    expect(paths).toEqual(['/me']);
    paths.length = 0;
    const user = await runLoader(Route, { context: { queryClient } });
    expect(user?.registration).toBe('202600001');
    expect(paths).toEqual(['/me']);
});

test.each([42, null])(
    'conta mantém as ações e usa o ID do curso no caminho (%s)',
    async (courseId) => {
        const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
        const user: components['schemas']['UserProfile'] = {
            name: 'Nome Discente',
            registration: '202600001',
            photo: null,
            bio: 'a'.repeat(1024) + 'Trecho acima do limite',
            unit: null,
            course: courseId === null ? null : { id: courseId, name: 'Curso Teste', shift: null },
            entry_semester: null,
            integralization: null,
            workload: null,
            period_max_workload: null,
            ira: null,
            mp: null,
            level: 'Graduação'
        };
        client.setQueryData(meQueryOptions.queryKey, user);
        client.setQueryData(settingsQueryOptions('202600001').queryKey, { displayName: 'Renan' });
        const router = createRouter({
            routeTree: createRootRoute({ component: Route.options.component }),
            history: createMemoryHistory({ initialEntries: ['/'] })
        });
        await router.load();
        const browser = new Window();
        try {
            browser.document.body.innerHTML = renderToStaticMarkup(
                <QueryClientProvider client={client}>
                    <RouterProvider router={router} />
                </QueryClientProvider>
            );
            expect(browser.document.body.textContent).toContain('a'.repeat(1024));
            expect(browser.document.body.textContent).not.toContain('Trecho acima do limite');
            const account = [...browser.document.querySelectorAll('[data-slot="card"]')].find(
                (card) => card.textContent.includes('Editar perfil')
            );
            expect(account).toBeDefined();
            expect(account?.className).toContain('divide-y');
            const nameRow = account?.firstElementChild;
            expect(nameRow?.tagName).toBe('DIV');
            expect(nameRow?.querySelector('button')?.textContent).toContain('Editar perfil');
            let downloadsRow = nameRow?.nextElementSibling;
            if (courseId !== null) {
                const flowWrapper = downloadsRow;
                expect(flowWrapper?.tagName).toBe('DIV');
                const flowRow = flowWrapper?.querySelector('a');
                expect(flowRow?.tagName).toBe('A');
                expect(flowRow?.textContent).toContain('Fluxo acadêmico');
                expect(flowRow?.getAttribute('href')).toBe('/cursos/42');
                expect(flowRow?.querySelector('.lucide-git-fork')).not.toBeNull();
                downloadsRow = flowWrapper?.nextElementSibling;
            } else {
                expect(account?.querySelector('a[href^="/cursos/"]')).toBeNull();
            }
            const documents = browser.document.querySelector('section[aria-label="Documentos"]');
            expect(documents?.textContent).toContain('Carteirinha');
            expect(documents?.textContent).toContain('Histórico');
            expect(documents?.querySelectorAll('button')).toHaveLength(2);
            expect(account?.querySelector('button[aria-label^="Baixar"]')).toBeNull();
            expect(account?.querySelectorAll('.lucide-chevron-right').length).toBe(
                courseId !== null ? 2 : 1
            );
            expect(account?.querySelector('.lucide-pencil')).not.toBeNull();
            expect(account?.querySelector('.lucide-log-out')).not.toBeNull();
        } finally {
            client.clear();
            await browser.happyDOM.abort();
        }
    }
);
