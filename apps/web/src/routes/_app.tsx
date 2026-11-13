import { loadQuery } from '@followw/core/queries/load.ts';
import { Outlet, createFileRoute } from '@tanstack/react-router';

import { AppLayout } from '#/components/AppLayout';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/_app')({
    loader: async ({ context: { queryClient } }) => {
        await loadQuery(queryClient, meQueryOptions);
    },
    component: () => (
        <AppLayout>
            <Outlet />
        </AppLayout>
    )
});
