import { noop, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { ClassCard } from '#/components/home/ClassCard';
import { LoginPromptCard } from '#/components/home/LoginPromptCard';
import { Card } from '#/components/ui/Card';
import { ErrorCard, ErrorState, SIGAA_DOWN_MESSAGE } from '#/components/ui/ErrorState';
import { HeaderBar } from '#/components/ui/HeaderBar';
import { PullToRefresh } from '#/components/ui/PullToRefresh';
import { describeSchedule } from '#/lib/schedule';
import { classroomsQueryOptions } from '#/queries/classrooms';
import { meQueryOptions } from '#/queries/me';
import { refreshQuery } from '#/queries/refresh';

export const Route = createFileRoute('/turmas')({
    loader: async ({ context: { queryClient } }) => {
        const user = await queryClient.query(meQueryOptions);
        // erro das turmas é tratado na página, sem derrubar a rota
        if (user) await queryClient.query(classroomsQueryOptions).catch(noop);
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
            <HeaderBar>
                <h1 className="text-3xl leading-none font-bold tracking-tight text-ink">
                    Minhas Turmas
                </h1>
            </HeaderBar>
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
            {classrooms?.map((classroom) => (
                <ClassCard
                    key={classroom.id}
                    title={classroom.subject.name}
                    code={classroom.subject.code ?? undefined}
                    time={describeSchedule(classroom.schedule) ?? 'Horário a definir'}
                    location={classroom.room ?? 'Local não informado'}
                    professor={`Turma ${classroom.number} • ${classroom.semester}`}
                    onClick={() => navigate({ to: '/turmas/$id', params: { id: classroom.id } })}
                />
            ))}
            {(isPending || classrooms.length === 0) && (
                <Card className="text-center text-sm text-muted">
                    {isPending ? 'Carregando turmas...' : 'Nenhuma turma no semestre atual.'}
                </Card>
            )}
        </>
    );
}
