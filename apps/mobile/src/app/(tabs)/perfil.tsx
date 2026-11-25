import { classroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { settingsQueryOptions } from '@followw/core/queries/settings.ts';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { LoginRedirect } from '@/components/auth/LoginRedirect';
import { HeaderBar, HeaderTitle } from '@/components/HeaderBar';
import { AccountSection } from '@/components/profile/AccountSection';
import { DocumentDownloads } from '@/components/profile/DocumentDownloads';
import {
    AcademicPerformance,
    ProfileIdentity,
    ProfileSection,
    ProgressSection
} from '@/components/profile/ProfileOverview';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';
import { SettingsLink } from '@/components/SettingsLink';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export { ErrorState as ErrorBoundary } from '@/components/ErrorState';

function ProfileHeader() {
    return (
        <HeaderBar actions={<SettingsLink />}>
            <HeaderTitle>Perfil</HeaderTitle>
        </HeaderBar>
    );
}

export default function ProfileScreen() {
    const router = useRouter();
    const me = useQuery(meQueryOptions);
    const user = me.data;
    const settings = useQuery(settingsQueryOptions(user?.registration ?? null));

    return (
        <Screen
            header={<ProfileHeader />}
            onRefreshData={(queryClient) =>
                Promise.all([
                    refreshQuery(queryClient, meQueryOptions),
                    refreshQuery(queryClient, classroomsQueryOptions),
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
                                <AcademicPerformance
                                    user={data}
                                    action={
                                        data.level === 'Graduação' && (
                                            <Button
                                                variant="outline"
                                                onPress={() => router.push('/perfil/simulador')}
                                            >
                                                <Text>Simular IRA e MP</Text>
                                            </Button>
                                        )
                                    }
                                />
                                <ProgressSection user={data} />
                                <ProfileSection title="Documentos">
                                    <DocumentDownloads />
                                </ProfileSection>
                                <AccountSection
                                    user={data}
                                    displayName={settings.data?.displayName}
                                />
                            </View>
                        </>
                    ) : (
                        <LoginRedirect />
                    )
                }
            </QueryState>
        </Screen>
    );
}
