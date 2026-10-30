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
import { Route } from '#/routes/_app/perfil';

test.each([42, null])(
    'conta mantém as ações e usa o ID do curso no caminho (%s)',
    async (courseId) => {
        const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
        const user: components['schemas']['UserProfile'] = {
            name: 'Nome Discente',
            registration: '202600001',
            photo: null,
            bio: null,
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
            const account = [...browser.document.querySelectorAll('[data-slot="card"]')].find(
                (card) => card.textContent.includes('Nome de exibição')
            );
            expect(account).toBeDefined();
            expect(account?.className).toContain('divide-y');
            const nameRow = account?.firstElementChild;
            expect(nameRow?.tagName).toBe('DIV');
            expect(nameRow?.querySelector('button')?.textContent).toContain('Nome de exibição');
            let downloadsRow = nameRow?.nextElementSibling;
            if (courseId !== null) {
                const flowWrapper = downloadsRow;
                expect(flowWrapper?.tagName).toBe('DIV');
                const flowRow = flowWrapper?.querySelector('a');
                expect(flowRow?.tagName).toBe('A');
                expect(flowRow?.textContent).toContain('Visualizar fluxo acadêmico');
                expect(flowRow?.getAttribute('href')).toBe('/cursos/42');
                expect(flowRow?.querySelector('.lucide-git-fork')).not.toBeNull();
                downloadsRow = flowWrapper?.nextElementSibling;
            } else {
                expect(account?.querySelector('a[href^="/cursos/"]')).toBeNull();
            }
            expect(downloadsRow?.textContent).toContain('Carteirinha estudantil');
            expect(account?.querySelectorAll('.lucide-chevron-right').length).toBe(0);
            expect(account?.querySelector('.lucide-pencil')).not.toBeNull();
            expect(account?.querySelector('.lucide-log-out')).not.toBeNull();
        } finally {
            client.clear();
            await browser.happyDOM.abort();
        }
    }
);
