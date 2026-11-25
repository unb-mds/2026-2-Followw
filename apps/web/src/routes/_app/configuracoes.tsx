import { loadQuery } from '@followw/core/queries/load.ts';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { BackHeader } from '#/components/HeaderBar';
import { AppearanceSection } from '#/components/settings/AppearanceSection';
import { ConnectedApps } from '#/components/settings/ConnectedApps';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/_app/configuracoes')({
    loader: async ({ context, location }) => {
        const user = await loadQuery(context.queryClient, meQueryOptions);
        if (!user) throw redirect({ to: '/login', search: { returnTo: location.href } });
    },
    head: () => ({ meta: [{ title: 'Configurações | Followw' }] }),
    staticData: {
        header: () => <BackHeader to="/perfil" title="Configurações" />
    },
    component: SettingsPage
});

function SettingsPage() {
    return (
        <div className="flex max-w-2xl flex-col gap-6 pb-6">
            <AppearanceSection />
            <ConnectedApps />
        </div>
    );
}
