import { noop } from '@tanstack/react-query';
import { Outlet, createFileRoute } from '@tanstack/react-router';

import { AppLayout } from '#/components/AppLayout';
import { meQueryOptions } from '#/queries/me';
import { restoreSettings, settingsQueryOptions } from '#/queries/settings';

export const Route = createFileRoute('/_app')({
    loader: async ({ context: { queryClient } }) => {
        const user = await queryClient.query(meQueryOptions);
        if (!user) return;
        restoreSettings(queryClient, user.registration);
        await queryClient.query(settingsQueryOptions(user.registration)).catch(noop);
    },
    component: () => (
        <AppLayout>
            <Outlet />
        </AppLayout>
    )
});
