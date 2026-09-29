import { noop, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { ClassCard } from '#/components/home/ClassCard';
import { LoginPromptCard } from '#/components/home/LoginPromptCard';
import { Card } from '#/components/ui/Card';
import { ErrorCard, ErrorState, SIGAA_DOWN_MESSAGE } from '#/components/ui/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/ui/HeaderBar';
import { PullToRefresh } from '#/components/ui/PullToRefresh';
import { describeSchedule } from '#/lib/schedule';
import { classroomsQueryOptions } from '#/queries/classrooms';
import { meQueryOptions } from '#/queries/me';
import { refreshQuery } from '#/queries/refresh';

export const Route = createFileRoute('/_app/turmas')({
    loader: async ({ context: { queryClient } }) => {
        const user = await queryClient.query(meQueryOptions);
        // erro das turmas é tratado na página, sem derrubar a rota
        if (user) await queryClient.query(classroomsQueryOptions).catch(noop);
    },
    staticData: {
        header: () => (
            <HeaderBar>
                <HeaderTitle>Minhas Turmas</HeaderTitle>
            </HeaderBar>
        )
    },
    errorComponent: ErrorState,
    component: TurmasPage
});

function TurmasPage() {
    const queryClient = useQueryClient();
    const { data: user } = useSuspenseQuery(meQueryOptions);

    return (
        <PullToRefresh
            disabled={!user}
            onRefresh={() => refreshQuery(queryClient, classroomsQueryOptions)}
        >
            {user ? <Classrooms /> : <LoginPromptCard />}
        </PullToRefresh>
    );
}

function Classrooms() {
    const navigate = useNavigate();
    const { data: classrooms, isPending, isError, refetch } = useQuery(classroomsQueryOptions);

    if (isError) return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => refetch()} />;

    return (
        <>
            <div className="flex flex-col gap-2">
                {classrooms?.map((classroom) => (
                    <ClassCard
                        key={classroom.id}
                        title={classroom.subject.name}
                        code={classroom.subject.code ?? undefined}
                        time={describeSchedule(classroom.schedule) ?? 'Horário a definir'}
                        location={classroom.room ?? 'Local não informado'}
                        professor={`Turma ${classroom.number} • ${classroom.semester}`}
                        onClick={() =>
                            navigate({ to: '/turmas/$id', params: { id: classroom.id } })
                        }
                    />
                ))}
            </div>
            {(isPending || classrooms.length === 0) && (
                <Card className="text-center text-sm text-muted">
                    {isPending ? 'Carregando turmas...' : 'Nenhuma turma no semestre atual.'}
                </Card>
            )}
        </>
    );
}
