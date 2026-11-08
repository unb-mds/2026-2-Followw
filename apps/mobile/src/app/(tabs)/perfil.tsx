import { meQueryOptions } from '@followw/core/queries/me.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { settingsQueryOptions } from '@followw/core/queries/settings.ts';
import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { HeaderBar, HeaderTitle } from '@/components/HeaderBar';
import { AccountSection } from '@/components/profile/AccountSection';
import {
    AcademicPerformance,
    ProfileIdentity,
    ProgressSection
} from '@/components/profile/ProfileOverview';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';
import { ThemeToggle } from '@/components/ThemeToggle';

export { ErrorState as ErrorBoundary } from '@/components/ErrorState';

function ProfileHeader() {
    return (
        <HeaderBar actions={<ThemeToggle />}>
            <HeaderTitle>Perfil</HeaderTitle>
        </HeaderBar>
    );
}

export default function ProfileScreen() {
    const me = useQuery(meQueryOptions);
    const user = me.data;
    const settings = useQuery(settingsQueryOptions(user?.registration ?? null));

    return (
        <Screen
            header={<ProfileHeader />}
            onRefreshData={(queryClient) =>
                Promise.all([
                    refreshQuery(queryClient, meQueryOptions),
                    user &&
                        queryClient.query({
                            ...settingsQueryOptions(user.registration),
                            staleTime: 0
                        })
                ])
            }
        >
            <QueryState
                query={me}
                loading="Carregando perfil..."
                error="Não foi possível carregar o perfil."
                stale="Não foi possível atualizar o perfil."
            >
                {(data) =>
                    data ? (
                        <>
                            <ProfileIdentity user={data} displayName={settings.data?.displayName} />
                            <View className="my-4 gap-4">
                                <AcademicPerformance user={data} />
                                <ProgressSection user={data} />
                                <AccountSection
                                    displayName={settings.data?.displayName}
                                    courseId={data.course?.id}
                                />
                            </View>
                        </>
                    ) : (
                        <Redirect href="/login" />
                    )
                }
            </QueryState>
        </Screen>
    );
}
