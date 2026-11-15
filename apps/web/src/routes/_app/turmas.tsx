import { groupBySemester } from '@followw/core/lib/classroom-details.ts';
import { describeSchedule } from '@followw/core/lib/schedule.ts';
import { allClassroomsQueryOptions, finalGrade } from '@followw/core/queries/classrooms.ts';
import { loadQuery } from '@followw/core/queries/load.ts';
import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { m } from 'motion/react';
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
import { rise, SlideSwitch, useEntrance, useSlideDirection } from '#/lib/motion';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/_app/turmas')({
    codeSplitGroupings: [['loader'], ['component'], ['errorComponent']],
    head: () => ({ meta: [{ title: 'Minhas Turmas | Followw' }] }),
    loader: async ({ context: { queryClient } }) => {
        const user = await loadQuery(queryClient, meQueryOptions);
        if (user) await loadQuery(queryClient, allClassroomsQueryOptions).catch(noop);
    },
    staticData: {
        header: () => (
            <HeaderBar hideOnDesktop>
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
    const desktop = useDesktop();
    const navigate = useNavigate();
    const {
        data: classrooms,
        isPending,
        isLoadingError,
        refetch
    } = useQuery(allClassroomsQueryOptions);
    const [selected, setSelected] = useState<string>();
    const entrance = useEntrance();

    const groups = groupBySemester(classrooms ?? []);
    const [semester, items] = groups.find(([name]) => name === selected) ?? groups[0] ?? [];
    const direction = useSlideDirection(
        semester ? groups.findIndex(([name]) => name === semester) : undefined
    );

    if (isLoadingError) return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => refetch()} />;

    return (
        <div className="relative flex flex-col gap-2">
            {groups.length > 0 && (
                <TabFilter
                    label="Escolher semestre"
                    value={semester}
                    options={groups.map(([name]) => name)}
                    onChange={setSelected}
                />
            )}
            <div className="classroom-columns lg:grid lg:items-start lg:gap-10">
                <section className="min-w-0">
                    <SlideSwitch id={semester ?? ''} direction={direction}>
                        <m.div
                            className="flex flex-col gap-2 lg:gap-4"
                            initial={direction ? false : entrance.initial}
                            animate={entrance.animate}
                        >
                            {items?.map((classroom, index) => (
                                <m.div key={classroom.id} custom={index} variants={rise}>
                                    <ClassCard
                                        title={classroom.subject.name}
                                        time={
                                            describeSchedule(classroom.schedule) ??
                                            'Horário a definir'
                                        }
                                        location={
                                            classroom.current
                                                ? (classroom.room ?? 'Local não informado')
                                                : undefined
                                        }
                                        grade={finalGrade(classroom)}
                                        status={
                                            classroom.status === 'pending_enrollment'
                                                ? 'pending'
                                                : 'normal'
                                        }
                                        onClick={() =>
                                            navigate({
                                                to: '/turmas/$id',
                                                params: { id: classroom.id }
                                            })
                                        }
                                    />
                                </m.div>
                            ))}
                        </m.div>
                    </SlideSwitch>
                </section>
                {desktop && items && items.length > 0 && (
                    <aside className="min-w-0 border-l pl-8">
                        <h2 className="mb-4 text-xl font-medium">Minha grade · {semester}</h2>
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
