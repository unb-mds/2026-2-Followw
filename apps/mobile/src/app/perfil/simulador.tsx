import type { UserProfile } from '@followw/core/queries/me.ts';

import { getCurrentSemester } from '@followw/core/calendar.ts';
import { allClassroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';

import { ErrorCard, StaleDataNotice } from '@/components/ErrorState';
import { BackHeader } from '@/components/HeaderBar';
import { LoadingText } from '@/components/LoadingText';
import { AcademicSimulator } from '@/components/profile/AcademicSimulator';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';

export { ErrorState as ErrorBoundary } from '@/components/ErrorState';

export default function SimulatorScreen() {
    const me = useQuery(meQueryOptions);
    return (
        <Screen
            header={<BackHeader to="/perfil" title="Simulador de IRA e MP" />}
            onRefreshData={(queryClient) => refreshQuery(queryClient, allClassroomsQueryOptions)}
        >
            <QueryState
                query={me}
                loading="Carregando perfil..."
                error="Não foi possível carregar o perfil."
                stale="Não foi possível atualizar o perfil."
            >
                {(user) =>
                    !user ? (
                        <Redirect href="/login" />
                    ) : user.level === 'Graduação' ? (
                        <SimulatorData user={user} />
                    ) : (
                        <Redirect href="/perfil" />
                    )
                }
            </QueryState>
        </Screen>
    );
}

function SimulatorData({ user }: { user: UserProfile }) {
    const classrooms = useQuery(allClassroomsQueryOptions);
    if (classrooms.isLoadingError) {
        return (
            <ErrorCard
                message="Não foi possível carregar suas disciplinas."
                onRetry={() => void classrooms.refetch()}
            />
        );
    }
    if (classrooms.isPending) return <LoadingText>Carregando disciplinas...</LoadingText>;

    const current =
        getCurrentSemester()?.semester ??
        classrooms.data.find((classroom) => classroom.current)?.semester;
    return (
        <>
            {classrooms.isError && <StaleDataNotice subject="as disciplinas" />}
            <AcademicSimulator
                classrooms={classrooms.data}
                entry={user.entry_semester}
                current={current}
                curriculum={
                    user.curriculum_subject_codes?.length
                        ? new Set(user.curriculum_subject_codes)
                        : null
                }
            />
        </>
    );
}
