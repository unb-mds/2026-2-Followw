import { loadQuery } from '@followw/core/queries/load.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { settingsQueryOptions } from '@followw/core/queries/settings.ts';
import { noop } from '@tanstack/react-query';
import { Outlet, createFileRoute } from '@tanstack/react-router';

import { AppLayout } from '#/components/AppLayout';

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
