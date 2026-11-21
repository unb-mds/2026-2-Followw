import type { components } from '@followw/core/queries/schema.gen.ts';

import { settingsQueryOptions } from '@followw/core/queries/settings.ts';
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

import { meQueryOptions } from '#/queries/me';
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
            expect(browser.document.querySelector('a[href="/perfil/simulador"]')?.textContent).toBe(
                'Simular IRA e MP'
            );
            const account = [...browser.document.querySelectorAll('[data-slot="card"]')].find(
                (card) => card.textContent.includes('Editar perfil')
            );
            expect(account?.querySelector('button')?.textContent).toContain('Editar perfil');
            expect(account?.textContent).toContain('Desconectar');
            const flow = account?.querySelector('a[href^="/cursos/"]');
            if (courseId !== null) {
                expect(flow?.textContent).toContain('Fluxo acadêmico');
                expect(flow?.getAttribute('href')).toBe('/cursos/42');
            } else {
                expect(flow).toBeNull();
            }
            const documents = browser.document.querySelector('section[aria-label="Documentos"]');
            expect(documents?.textContent).toContain('Carteirinha');
            expect(documents?.textContent).toContain('Histórico');
            expect(documents?.querySelectorAll('button')).toHaveLength(2);
            expect(account?.querySelector('button[aria-label^="Baixar"]')).toBeNull();
        } finally {
            client.clear();
            await browser.happyDOM.abort();
        }
    }
);
