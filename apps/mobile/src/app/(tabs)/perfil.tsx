import { meQueryOptions } from '@followw/core/queries/me.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { settingsQueryOptions } from '@followw/core/queries/settings.ts';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { LogIn, ShieldCheck } from 'lucide-react-native';

import { ListCard, ListChevron, ListRow } from '@/components/ListCard';
import { OfflineBanner } from '@/components/OfflineBanner';
import { PageState } from '@/components/PageState';
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
import { TabFilter } from '@/components/TabFilter';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { THEME_LABELS, type Theme, setTheme, useThemePreference } from '@/lib/theme';

const THEMES = ['system', 'light', 'dark'] as const satisfies Theme[];

export { ErrorState as ErrorBoundary } from '@/components/ErrorState';

export default function ProfileScreen() {
    const router = useRouter();
    const me = useQuery(meQueryOptions);
    const user = me.data;
    const settings = useQuery(settingsQueryOptions(user?.registration ?? null));

    return (
        <Screen
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
            <OfflineBanner />
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
                            <AcademicPerformance user={data} />
                            <ProgressSection user={data} />
                            <AccountSection
                                displayName={settings.data?.displayName}
                                courseId={data.course?.id}
                            />
                            <ProfileSection title="Documentos">
                                <DocumentDownloads />
                            </ProfileSection>
                        </>
                    ) : (
                        <PageState
                            icon={LogIn}
                            title="Entre com sua conta do SIGAA"
                            message="Veja seu perfil, suas turmas e seus documentos."
                        >
                            <Button onPress={() => router.push('/login')}>
                                <Text>Entrar</Text>
                            </Button>
                        </PageState>
                    )
                }
            </QueryState>
            <ProfileSection title="Aparência">
                <AppearancePicker />
            </ProfileSection>
            <ProfileSection title="Sobre">
                <ListCard>
                    <ListRow
                        icon={ShieldCheck}
                        title="Privacidade e termos"
                        trailing={<ListChevron />}
                        onPress={() => router.push('/privacidade')}
                    />
                </ListCard>
            </ProfileSection>
        </Screen>
    );
}

function AppearancePicker() {
    const theme = useThemePreference();
    return (
        <TabFilter
            label="Tema"
            value={theme}
            options={THEMES}
            labels={THEME_LABELS}
            onChange={setTheme}
        />
    );
}
