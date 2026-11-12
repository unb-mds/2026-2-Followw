import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider
} from '@tanstack/react-router';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';

import { AppLayout } from '#/components/AppLayout';
import { parseRouterSearch, stringifyRouterSearch } from '#/lib/search-params';
import {
    allClassroomsQueryOptions,
    classroomsQueryOptions,
    type Classroom
} from '#/queries/classrooms';
import { meQueryOptions, type UserProfile } from '#/queries/me';
import { searchQueryOptions } from '#/queries/search';
import { settingsQueryOptions } from '#/queries/settings';
import { Route as SearchRoute } from '#/routes/_app/buscar';
import { Route as ProfileRoute } from '#/routes/_app/perfil';
import { Route as ClassroomsRoute } from '#/routes/_app/turmas';

export const desktopUser: UserProfile = {
    name: 'DISCENTE COM NOME EXTENSO PARA CONFERÊNCIA',
    registration: '202600099',
    photo: null,
    bio: null,
    course: { id: 42, name: 'ENGENHARIA DE COMPUTAÇÃO E SISTEMAS', shift: null },
    unit: null,
    entry_semester: '2026.1',
    integralization: 37,
    ira: 3.72,
    mp: 3.55,
    period_max_workload: 360,
    level: 'Graduação',
    workload: {
        total: 3000,
        pending_mandatory: 1500,
        pending_optional: 360,
        pending_complementary: 0,
        mandatory: null,
        optional: null,
        complementary: null
    }
};

export const desktopClassrooms: Classroom[] = [
    {
        id: 'morning',
        number: '01',
        semester: '2026.2',
        current: true,
        subject: { code: 'MAT1000', name: 'Disciplina com nome extenso de manhã', hours: 60 },
        schedule: '2M12',
        professors: []
    },
    {
        id: 'night',
        number: '02',
        semester: '2026.2',
        current: true,
        subject: { code: 'MAT2000', name: 'Disciplina de noite', hours: 60 },
        schedule: '2N34 7N4',
        professors: []
    }
];

export function desktopPage(url: string, user: UserProfile | null = desktopUser) {
    const client = new QueryClient({
        defaultOptions: { queries: { staleTime: Infinity, retry: false } }
    });
    client.setQueryData(meQueryOptions.queryKey, user);
    client.setQueryData(searchQueryOptions('MAT1000', ['subjects']).queryKey, {
        subjects: [],
        courses: null,
        professors: null
    });
    client.setQueryData(allClassroomsQueryOptions.queryKey, desktopClassrooms);
    client.setQueryData(classroomsQueryOptions.queryKey, desktopClassrooms);
    if (user) client.setQueryData(settingsQueryOptions(user.registration).queryKey, {});
    const root = createRootRoute({
        component: () => (
            <NuqsAdapter>
                <AppLayout>
                    <Outlet />
                </AppLayout>
            </NuqsAdapter>
        )
    });
    const search = createRoute({
        getParentRoute: () => root,
        path: '/buscar',
        component: SearchRoute.options.component,
        staticData: SearchRoute.options.staticData,
        validateSearch: SearchRoute.options.validateSearch
    });
    const profile = createRoute({
        getParentRoute: () => root,
        path: '/perfil',
        component: ProfileRoute.options.component,
        staticData: ProfileRoute.options.staticData
    });
    const classrooms = createRoute({
        getParentRoute: () => root,
        path: '/turmas',
        component: ClassroomsRoute.options.component,
        staticData: ClassroomsRoute.options.staticData
    });
    const home = createRoute({
        getParentRoute: () => root,
        path: '/',
        component: () => <p>Início</p>
    });
    const router = createRouter({
        routeTree: root.addChildren([home, search, profile, classrooms]),
        history: createMemoryHistory({ initialEntries: [url] }),
        trailingSlash: 'preserve',
        parseSearch: parseRouterSearch,
        stringifySearch: stringifyRouterSearch
    });
    return {
        client,
        router,
        element: (
            <QueryClientProvider client={client}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        )
    };
}
