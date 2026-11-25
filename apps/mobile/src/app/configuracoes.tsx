import { meQueryOptions } from '@followw/core/queries/me.ts';
import { oauthGrantsQueryOptions } from '@followw/core/queries/oauth.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import { LoginRedirect } from '@/components/auth/LoginRedirect';
import { BackHeader } from '@/components/HeaderBar';
import { Screen } from '@/components/Screen';
import { AppearanceSection } from '@/components/settings/AppearanceSection';
import { ConnectedApps } from '@/components/settings/ConnectedApps';

export { ErrorState as ErrorBoundary } from '@/components/ErrorState';

export default function SettingsScreen() {
    const me = useQuery(meQueryOptions);
    if (me.isSuccess && !me.data) return <LoginRedirect />;
    return (
        <Screen
            header={<BackHeader to="/perfil" title="Configurações" />}
            onRefreshData={(queryClient) => refreshQuery(queryClient, oauthGrantsQueryOptions)}
        >
            <View className="gap-6 pb-6">
                <AppearanceSection />
                {me.data && <ConnectedApps />}
            </View>
        </Screen>
    );
}
