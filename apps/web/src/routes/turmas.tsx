import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { ClassCard } from '#/components/home/ClassCard';
import { LoginPromptCard } from '#/components/home/LoginPromptCard';
import { Card } from '#/components/ui/Card';
import { ErrorState } from '#/components/ui/ErrorState';
import { HeaderBar } from '#/components/ui/HeaderBar';
import { SectionHeader } from '#/components/ui/SectionHeader';
import { describeSchedule } from '#/lib/schedule';
import { classroomsQueryOptions } from '#/queries/classrooms';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/turmas')({
    loader: async ({ context: { queryClient } }) => {
        const user = await queryClient.query(meQueryOptions);
        if (user) await queryClient.query(classroomsQueryOptions);
    },
    errorComponent: ErrorState,
    component: TurmasPage
});

function TurmasPage() {
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const { data: classrooms = [] } = useQuery({
        ...classroomsQueryOptions,
        enabled: Boolean(user)
    });

    return (
        <>
            <HeaderBar />
            {user ? (
                <>
                    <SectionHeader
                        title="Minhas Turmas"
                        badge={`${classrooms.length} disciplinas`}
                    />
                    {classrooms.map((classroom) => (
                        <ClassCard
                            key={classroom.id}
                            title={classroom.subject.name}
                            code={classroom.subject.code ?? undefined}
                            time={describeSchedule(classroom.schedule) ?? 'Horário a definir'}
                            location={classroom.room ?? 'Local não informado'}
                            professor={`Turma ${classroom.number} • ${classroom.semester}`}
                        />
                    ))}
                    {classrooms.length === 0 && (
                        <Card className="text-center text-sm text-muted">
                            Nenhuma turma no semestre atual.
                        </Card>
                    )}
                </>
            ) : (
                <LoginPromptCard />
            )}
        </>
    );
}
