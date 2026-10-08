import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { ErrorCard, ErrorState, SIGAA_DOWN_MESSAGE } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import { ClassCard } from '#/components/home/ClassCard';
import { LoginPromptCard } from '#/components/home/LoginPromptCard';
import { LoadingText } from '#/components/LoadingText';
import { Card, CardContent } from '#/components/ui/card';
import { Toggle } from '#/components/ui/toggle';
import { groupBySemester } from '#/lib/classroom-details';
import { describeSchedule } from '#/lib/schedule';
import { allClassroomsQueryOptions } from '#/queries/classrooms';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/_app/turmas')({
    head: () => ({ meta: [{ title: 'Minhas Turmas | Followw' }] }),
    loader: async ({ context: { queryClient } }) => {
        const user = await loadQuery(queryClient, meQueryOptions);
        if (user) await loadQuery(queryClient, allClassroomsQueryOptions).catch(noop);
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
    const {
        data: classrooms,
        isPending,
        isLoadingError,
        refetch
    } = useQuery(allClassroomsQueryOptions);
    const [selected, setSelected] = useState<string>();

    const groups = groupBySemester(classrooms ?? []);
    const [semester, items] = groups.find(([name]) => name === selected) ?? groups[0] ?? [];

    if (isLoadingError) return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => refetch()} />;

    return (
        <>
            {groups.length > 0 && (
                <div
                    className="mb-4 flex items-center gap-2 overflow-x-auto py-1 max-md:no-scrollbar"
                    aria-label="Escolher semestre"
                >
                    {groups.map(([name]) => (
                        <Toggle
                            key={name}
                            variant="outline"
                            pressed={name === semester}
                            onPressedChange={() => setSelected(name)}
                            className="shrink-0 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                        >
                            {name}
                        </Toggle>
                    ))}
                </div>
            )}
            <div className="flex flex-col gap-2">
                {items?.map((classroom) => (
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
                        grade={classroom.current ? undefined : classroom.grade}
                        onClick={() =>
                            navigate({ to: '/turmas/$id', params: { id: classroom.id } })
                        }
                    />
                ))}
            </div>
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
