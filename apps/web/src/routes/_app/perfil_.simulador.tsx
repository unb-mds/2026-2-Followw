import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Navigate, createFileRoute, redirect } from '@tanstack/react-router';

import type { UserProfile } from '#/queries/me';

import { getCurrentSemester } from '#/calendar';
import { ErrorCard, ErrorState, StaleDataNotice } from '#/components/ErrorState';
import { BackHeader } from '#/components/HeaderBar';
import { LoadingText } from '#/components/LoadingText';
import { AcademicSimulator } from '#/components/profile/AcademicSimulator';
import { allClassroomsQueryOptions } from '#/queries/classrooms';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/_app/perfil_/simulador')({
    head: () => ({ meta: [{ title: 'Simulador de IRA e MP | Followw' }] }),
    loader: async ({ context: { queryClient } }) => {
        const user = await loadQuery(queryClient, meQueryOptions);
        if (!user) throw redirect({ to: '/login' });
        if (user.level !== 'Graduação') throw redirect({ to: '/perfil' });
        await loadQuery(queryClient, allClassroomsQueryOptions).catch(noop);
    },
    staticData: {
        header: () => <BackHeader to="/perfil" title="Simulador de IRA e MP" />
    },
    errorComponent: ErrorState,
    component: SimulatorPage
});

function SimulatorPage() {
    const { data: user } = useSuspenseQuery(meQueryOptions);
    if (!user) return <Navigate to="/login" replace />;
    if (user.level !== 'Graduação') return <Navigate to="/perfil" replace />;
    return <SimulatorData user={user} />;
}

function SimulatorData({ user }: { user: UserProfile }) {
    const classrooms = useQuery(allClassroomsQueryOptions);
    if (classrooms.isLoadingError) {
        return (
            <ErrorCard
                message="Não foi possível carregar suas disciplinas."
                onRetry={() => classrooms.refetch()}
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
