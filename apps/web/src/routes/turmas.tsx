import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { ClassCard } from '#/components/home/ClassCard';
import { LoginPromptCard } from '#/components/home/LoginPromptCard';
import { Card } from '#/components/ui/Card';
import { ErrorCard, ErrorState, SIGAA_DOWN_MESSAGE } from '#/components/ui/ErrorState';
import { HeaderBar } from '#/components/ui/HeaderBar';
import { SectionHeader } from '#/components/ui/SectionHeader';
import { describeSchedule } from '#/lib/schedule';
import { classroomsQueryOptions } from '#/queries/classrooms';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/turmas')({
    ssr: false,
    loader: async ({ context: { queryClient } }) => {
        const user = await queryClient.query(meQueryOptions);
        // erro das turmas é tratado na página, sem derrubar a rota
        if (user) await queryClient.query(classroomsQueryOptions).catch(noop);
    },
    errorComponent: ErrorState,
    component: TurmasPage
});

function TurmasPage() {
    const { data: user } = useSuspenseQuery(meQueryOptions);

    return (
        <>
            <HeaderBar />
            {user ? <Classrooms /> : <LoginPromptCard />}
        </>
    );
}

function Classrooms() {
    const { data: classrooms, isPending, isError, refetch } = useQuery(classroomsQueryOptions);

    if (isError) return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => refetch()} />;

    return (
        <>
            <SectionHeader
                title="Minhas Turmas"
                badge={classrooms && `${classrooms.length} disciplinas`}
            />
            {classrooms?.map((classroom) => (
                <ClassCard
                    key={classroom.id}
                    title={classroom.subject.name}
                    code={classroom.subject.code ?? undefined}
                    time={describeSchedule(classroom.schedule) ?? 'Horário a definir'}
                    location={classroom.room ?? 'Local não informado'}
                    professor={`Turma ${classroom.number} • ${classroom.semester}`}
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
