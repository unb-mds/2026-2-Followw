import { createFileRoute } from '@tanstack/react-router';

import { BackHeader } from '#/components/HeaderBar';
import { AppearanceSection } from '#/components/settings/AppearanceSection';
import { ConnectedApps } from '#/components/settings/ConnectedApps';
import { DeleteAccountLink } from '#/components/settings/DeleteAccountLink';
import { requireUser } from '#/lib/require-user';

export const Route = createFileRoute('/_app/configuracoes')({
    loader: async ({ context, location }) => {
        await requireUser(context.queryClient, location.href);
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
            <DeleteAccountLink />
        </div>
    );
}
