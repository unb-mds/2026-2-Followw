import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { ErrorCard, ErrorState, SIGAA_DOWN_MESSAGE } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import { ClassCard } from '#/components/home/ClassCard';
import { LoginPromptCard } from '#/components/home/LoginPromptCard';
import { LoadingText } from '#/components/LoadingText';
import { SectionHeader } from '#/components/SectionHeader';
import { Card, CardContent } from '#/components/ui/card';
import { groupBySemester } from '#/lib/classroom-details';
import { describeSchedule } from '#/lib/schedule';
import { allClassroomsQueryOptions } from '#/queries/classrooms';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/_app/turmas')({
    loader: async ({ context: { queryClient } }) => {
        const user = await queryClient.query(meQueryOptions);
        // erro das turmas é tratado na página, sem derrubar a rota
        if (user) await queryClient.query(allClassroomsQueryOptions).catch(noop);
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
    const { data: user } = useSuspenseQuery(meQueryOptions);

    return user ? <Classrooms /> : <LoginPromptCard />;
}

function Classrooms() {
    const navigate = useNavigate();
    const { data: classrooms, isPending, isError, refetch } = useQuery(allClassroomsQueryOptions);

    if (isError) return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => refetch()} />;

    return (
        <>
            {groupBySemester(classrooms ?? []).map(([semester, items]) => (
                <section key={semester} className="mb-6">
                    <SectionHeader title={semester} />
                    <div className="flex flex-col gap-2">
                        {items.map((classroom) => (
                            <ClassCard
                                key={classroom.id}
                                title={classroom.subject.name}
                                code={classroom.subject.code ?? undefined}
                                time={describeSchedule(classroom.schedule) ?? 'Horário a definir'}
                                location={
                                    classroom.current
                                        ? (classroom.room ?? 'Local não informado')
                                        : undefined
                                }
                                professor={`Turma ${classroom.number}`}
                                onClick={() =>
                                    navigate({ to: '/turmas/$id', params: { id: classroom.id } })
                                }
                            />
                        ))}
                    </div>
                </section>
            ))}
            {(isPending || classrooms.length === 0) && (
                <Card>
                    <CardContent className="text-center text-sm text-muted-foreground">
                        {isPending ? (
                            <LoadingText>Carregando turmas...</LoadingText>
                        ) : (
                            'Nenhuma turma encontrada.'
                        )}
                    </CardContent>
                </Card>
            )}
        </>
    );
}
