import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { useDesktop } from '#/components/DesktopContext';
import { ErrorCard, ErrorState, SIGAA_DOWN_MESSAGE } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import { ClassCard } from '#/components/home/ClassCard';
import { LoginPromptCard } from '#/components/home/LoginPromptCard';
import { LoadingText } from '#/components/LoadingText';
import { WeeklySchedule } from '#/components/schedule/WeeklySchedule';
import { TabFilter } from '#/components/TabFilter';
import { Card, CardContent } from '#/components/ui/card';
import { groupBySemester } from '#/lib/classroom-details';
import { describeSchedule } from '#/lib/schedule';
import { allClassroomsQueryOptions, finalGrade } from '#/queries/classrooms';
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
                <div className="flex flex-col gap-2">
                    <HeaderTitle>Minhas Turmas</HeaderTitle>
                    <p className="hidden text-sm text-muted-foreground desktop:block">
                        Disciplinas e horários
                    </p>
                </div>
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
    const desktop = useDesktop();
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
        <div className="relative flex flex-col gap-5">
            {groups.length > 0 && (
                <TabFilter
                    label="Escolher semestre"
                    value={semester}
                    options={groups.map(([name]) => name)}
                    onChange={setSelected}
                    className="turmas-semesters mb-2"
                />
            )}
            <div className="classroom-columns desktop:grid desktop:items-start desktop:gap-10">
                <section className="min-w-0">
                    <h2 className="mb-4 hidden text-xl font-medium desktop:block">
                        Disciplinas{' '}
                        <span className="float-right text-sm text-muted-foreground">
                            {items?.length ?? 0} turmas
                        </span>
                    </h2>
                    <div className="flex flex-col gap-2 desktop:gap-4">
                        {items?.map((classroom) => (
                            <ClassCard
                                key={classroom.id}
                                title={classroom.subject.name}
                                code={classroom.subject.code}
                                time={describeSchedule(classroom.schedule) ?? 'Horário a definir'}
                                location={
                                    classroom.current
                                        ? (classroom.room ?? 'Local não informado')
                                        : undefined
                                }
                                classNumber={classroom.number}
                                grade={finalGrade(classroom)}
                                status={
                                    classroom.status === 'pending_enrollment' ? 'pending' : 'normal'
                                }
                                onClick={() =>
                                    navigate({ to: '/turmas/$id', params: { id: classroom.id } })
                                }
                            />
                        ))}
                    </div>
                </section>
                {desktop && items && items.length > 0 && (
                    <aside className="min-w-0 border-l pl-8">
                        <h2 className="mb-4 text-xl font-medium">Grade semanal · {semester}</h2>
                        <WeeklySchedule
                            label={`Grade das turmas de ${semester}`}
                            entries={items.map((item) => ({
                                key: item.id,
                                code: item.subject.code,
                                name: item.subject.name,
                                number: item.number,
                                schedule: item.schedule
                            }))}
                            onSelect={(id) => void navigate({ to: '/turmas/$id', params: { id } })}
                        />
                    </aside>
                )}
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
        </div>
    );
}
