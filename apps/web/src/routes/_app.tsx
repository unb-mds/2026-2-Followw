import { noop } from '@tanstack/react-query';
import { Outlet, createFileRoute } from '@tanstack/react-router';

import { AppLayout } from '#/components/AppLayout';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';
import { settingsQueryOptions } from '#/queries/settings';

export const Route = createFileRoute('/_app')({
    loader: async ({ context: { queryClient } }) => {
        const user = await loadQuery(queryClient, meQueryOptions);
        if (!user) return;
        await loadQuery(queryClient, settingsQueryOptions(user.registration)).catch(noop);
    },
    component: () => (
        <AppLayout>
            <Outlet />
        </AppLayout>
    )
});
