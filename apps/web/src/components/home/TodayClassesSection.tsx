import { useNavigate } from '@tanstack/react-router';

import type { Day, ScheduledClass } from '#/lib/schedule';
import type { WeekLesson } from '#/queries/lessons';

import { ErrorCard, SIGAA_DOWN_MESSAGE } from '#/components/ErrorState';
import { ClassCard } from '#/components/home/ClassCard';
import { ClassProgress } from '#/components/home/ClassProgress';
import { LoginPromptCard } from '#/components/home/LoginPromptCard';
import { SectionHeader } from '#/components/SectionHeader';
import { dayTimeline } from '#/lib/day-timeline';
import { nowInBrasilia } from '#/lib/schedule';

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
    return (
        <div className="flex flex-col gap-2 lg:gap-3">
            {dayTimeline(classes, day, now).map(
                ({ item, start, end, status, progress, gap, overlap }) => (
                    <div key={item.id}>
                        {gap > 0 && (
                            <p className="mb-4 hidden items-center gap-4 text-center text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border lg:flex">
                                Intervalo de{' '}
                                {gap >= 60
                                    ? `${Math.floor(gap / 60)}h${gap % 60 ? `${gap % 60}min` : ''}`
                                    : `${gap}min`}
                            </p>
                        )}
                        {overlap && (
                            <p className="mb-1 hidden text-xs text-warning lg:block">
                                Horários sobrepostos
                            </p>
                        )}
                        <div className="flex gap-3 lg:gap-4">
                            <ClassProgress
                                progress={cancelled(item) ? 0 : progress}
                                absent={item.status === 'falta'}
                            />
                            <div className="min-w-0 flex-1">
                                <ClassCard
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
                            </div>
                        </div>
                    </div>
                )
            )}
        </div>
    );
}

const cancelled = (lesson: WeekLesson) => lesson.status === 'cancelada';
