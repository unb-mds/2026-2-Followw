import { getCurrentSemester } from '@followw/core/calendar.ts';
import { allClassroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { loadQuery } from '@followw/core/queries/load.ts';
import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Navigate, createFileRoute, redirect } from '@tanstack/react-router';

import type { UserProfile } from '#/queries/me';

import { LoginRedirect } from '#/components/auth/LoginRedirect';
import { ErrorCard, ErrorState, StaleDataNotice } from '#/components/ErrorState';
import { BackHeader } from '#/components/HeaderBar';
import { LoadingSkeleton } from '#/components/LoadingSkeleton';
import {
    AcademicSimulator,
    AcademicSimulatorSkeleton
} from '#/components/profile/AcademicSimulator';
import { requireUser } from '#/lib/require-user';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/_app/perfil_/simulador')({
    loader: async ({ context: { queryClient }, location }) => {
        const user = await requireUser(queryClient, location.href);
        if (user.level !== 'Graduação') throw redirect({ to: '/perfil' });
        await loadQuery(queryClient, allClassroomsQueryOptions).catch(noop);
    },
    head: () => ({ meta: [{ title: 'Simulador de IRA e MP | Followw' }] }),
    staticData: {
        header: () => <BackHeader to="/perfil" title="Simulador de IRA e MP" />
    },
    errorComponent: ErrorState,
    component: SimulatorPage
});

function SimulatorPage() {
    const { data: user } = useSuspenseQuery(meQueryOptions);
    if (!user) return <LoginRedirect />;
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
    if (classrooms.isPending)
        return (
            <LoadingSkeleton label="Carregando disciplinas...">
                <AcademicSimulatorSkeleton />
            </LoadingSkeleton>
        );

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
