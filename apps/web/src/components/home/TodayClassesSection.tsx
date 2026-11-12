import { useNavigate } from '@tanstack/react-router';
import { m } from 'motion/react';
import { Fragment } from 'react';

import type { Day, ScheduledClass } from '#/lib/schedule';
import type { WeekLesson } from '#/queries/lessons';

import { ErrorCard, SIGAA_DOWN_MESSAGE } from '#/components/ErrorState';
import { ClassCard } from '#/components/home/ClassCard';
import { ClassProgress } from '#/components/home/ClassProgress';
import { LoginPromptCard } from '#/components/home/LoginPromptCard';
import { SectionHeader } from '#/components/SectionHeader';
import { Card } from '#/components/ui/card';
import { dayTimeline } from '#/lib/day-timeline';
import { rise, useEntrance } from '#/lib/motion';
import { nowInBrasilia } from '#/lib/schedule';
import { cn } from '#/lib/shadcn';

interface TodayClassesSectionProps {
    loggedIn: boolean;
    noClassReason?: string;
    isLoadingError: boolean;
    onRetry: () => void;
    classes: ScheduledClass<WeekLesson>[];
    date?: string;
    now?: Day & { time: string };
}

export const TodayClassesSection: React.FC<TodayClassesSectionProps> = (props) => {
    const { loggedIn, noClassReason, isLoadingError, classes } = props;
    // sem aulas no dia, a seção some
    if (loggedIn && !noClassReason && !isLoadingError && !classes.length) return null;

    return (
        <section>
            <SectionHeader title="Aulas do dia" />
            <TodayClassesContent {...props} />
        </section>
    );
};

function TodayClassesContent({
    loggedIn,
    noClassReason,
    isLoadingError,
    onRetry,
    classes,
    date,
    now = nowInBrasilia()
}: TodayClassesSectionProps) {
    const navigate = useNavigate();
    const entrance = useEntrance();

    if (!loggedIn) return <LoginPromptCard />;
    if (noClassReason)
        return (
            <div className="rounded-2xl bg-card p-4">
                <p className="font-semibold">Não há aulas hoje</p>
                <p className="text-sm text-muted-foreground">{noClassReason}</p>
            </div>
        );
    if (isLoadingError) return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={onRetry} />;

    const day = date ?? now.date;
    const timeline = dayTimeline(classes, day, now);
    return (
        <div className="relative">
            {/* O fundo do card começa depois do trace, que fica fora dele. */}
            <Card
                size="sm"
                aria-hidden="true"
                className="absolute inset-y-0 right-0 left-3.5 py-0 lg:left-4.5"
            />
            <m.div key={day} className="relative flex flex-col" {...entrance}>
                {timeline.map(({ item, start, end, status, progress, gap, overlap }, index) => (
                    <Fragment key={item.id}>
                        {index > 0 && (
                            <div className="flex gap-3 lg:gap-4">
                                <ClassProgress progress={progress > 0 ? 1 : 0} absent={false} />
                                <div className={cn(CONTENT, 'flex pr-3 pl-4 lg:px-6')}>
                                    <Divider gap={gap} overlap={overlap} />
                                </div>
                            </div>
                        )}
                        <div className="flex gap-3 lg:gap-4">
                            <ClassProgress
                                progress={cancelled(item) ? 0 : progress}
                                absent={item.status === 'falta'}
                            />
                            <div
                                className={cn(
                                    CONTENT,
                                    'overflow-hidden',
                                    index === 0 && 'rounded-t-2xl',
                                    index === timeline.length - 1 && 'rounded-b-2xl'
                                )}
                            >
                                <m.div custom={index} variants={rise}>
                                    <ClassCard
                                        plain
                                        title={item.classroom.subject.name}
                                        time={`${start}–${end}`}
                                        location={item.classroom.room ?? 'Local não informado'}
                                        status={cancelled(item) ? 'cancelled' : status}
                                        onClick={() =>
                                            navigate({
                                                to: '/turmas/$id',
                                                params: { id: item.classroom.id }
                                            })
                                        }
                                    />
                                </m.div>
                            </div>
                        </div>
                    </Fragment>
                ))}
            </m.div>
        </div>
    );
}

/** Entre duas aulas: o intervalo, a sobreposição ou só a linha. */
function Divider({ gap, overlap }: { gap: number; overlap: boolean }) {
    const line =
        'flex flex-1 items-center gap-3 py-1 text-xs before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border';
    if (overlap) return <p className={cn(line, 'text-warning')}>Horários sobrepostos</p>;
    if (gap > 0)
        return (
            <p className={cn(line, 'text-muted-foreground')}>
                Intervalo de{' '}
                {gap >= 60
                    ? `${Math.floor(gap / 60)}h${gap % 60 ? `${gap % 60}min` : ''}`
                    : `${gap}min`}
            </p>
        );
    return <div className="my-auto h-px flex-1 bg-border" />;
}

const CONTENT = 'min-w-0 flex-1';

const cancelled = (lesson: WeekLesson) => lesson.status === 'cancelada';
