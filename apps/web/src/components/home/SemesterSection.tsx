import type { SemesterCalendar } from '@followw/core/calendar.ts';
import type { ReactNode } from 'react';

import { getActiveSemester } from '@followw/core/calendar.ts';
import { daysFrom, formatClassroomDate } from '@followw/core/lib/classroom-details.ts';
import { formatDuration, minutesOf, parseSchedule } from '@followw/core/lib/schedule.ts';
import { upcomingSemesterDates } from '@followw/core/lib/semester-dates.ts';
import { semesterClassroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { latestPostsQueryOptions } from '@followw/core/queries/posts.ts';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarClock } from 'lucide-react';

import { StaleDataNotice } from '#/components/ErrorState';
import { LinesSkeleton, LoadingSkeleton } from '#/components/LoadingSkeleton';
import { SectionHeader } from '#/components/SectionHeader';
import { Button } from '#/components/ui/button';
import { Card } from '#/components/ui/card';
import { Progress } from '#/components/ui/progress';

export function SemesterSection({ today, loggedIn }: { today: string; loggedIn: boolean }) {
    const semester = getActiveSemester(today);
    if (!semester) return null;

    const { start, end } = semester.classes;
    const duration = daysFrom(start, end);
    const elapsed = daysFrom(start, today);
    const remaining = daysFrom(today, end);
    const percent = remaining <= 0 ? 100 : Math.round((100 * Math.max(0, elapsed)) / duration);
    const weeks = Math.ceil((duration + 1) / 7);
    const week = Math.min(weeks, Math.floor(elapsed / 7) + 1);
    const countdown =
        remaining === 0
            ? 'Último dia de aulas'
            : `${remaining} ${remaining === 1 ? 'dia' : 'dias'} até o fim das aulas`;
    let status = `Semana ${week} de ${weeks} · ${countdown}`;
    if (today < start) status = `Aulas começam em ${formatClassroomDate(start).slice(0, 5)}`;
    if (today > end) status = 'Período de aulas encerrado';
    return (
        <section aria-label="Semestre">
            <SectionHeader title="Semestre" />
            <Card size="sm" className="gap-3 p-4 text-base lg:p-6">
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2 font-medium">
                        <h3>Semestre {semester.semester}</h3>
                        <span aria-hidden="true" className="text-primary tabular-nums">
                            {percent}%
                        </span>
                    </div>
                    <Progress aria-label="Progresso do período de aulas" value={percent} />
                    <p className="text-sm text-muted-foreground">{status}</p>
                </div>
                {loggedIn ? (
                    <StudentSemesterDetails semester={semester} today={today} />
                ) : (
                    <UpcomingDates dates={upcomingSemesterDates(today, semester.events)} />
                )}
            </Card>
        </section>
    );
}

function StudentSemesterDetails({
    semester,
    today
}: {
    semester: SemesterCalendar;
    today: string;
}) {
    const { data, isPending, isLoadingError, isError, refetch } = useQuery(
        semesterClassroomsQueryOptions(semester.semester)
    );
    const classrooms = (data ?? []).filter(
        ({ status }) => status !== 'trancado' && status !== 'denied'
    );
    const activities = useQuery({
        ...latestPostsQueryOptions,
        enabled: classrooms.some(
            ({ sigaa_id, status }) => sigaa_id != null && status !== 'pending_enrollment'
        )
    });
    const minutes = classrooms
        .flatMap(({ schedule }) => parseSchedule(schedule))
        .reduce((total, { start, end }) => total + minutesOf(end) - minutesOf(start), 0);

    return (
        <>
            <div className="border-t border-border pt-3">
                {isPending ? (
                    <LoadingSkeleton label="Carregando turmas do semestre...">
                        <LinesSkeleton lines={['w-full', 'w-full']} />
                    </LoadingSkeleton>
                ) : isLoadingError ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <p className="text-muted-foreground">
                            Não foi possível carregar as turmas.
                        </p>
                        <Button variant="link" size="sm" onClick={() => void refetch()}>
                            Tentar novamente
                        </Button>
                    </div>
                ) : (
                    <>
                        <dl className="flex flex-col gap-1.5">
                            <div className="flex justify-between gap-2">
                                <dt className="text-muted-foreground">Turmas no semestre</dt>
                                <dd className="font-medium tabular-nums">{classrooms.length}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-muted-foreground">Carga horária semanal</dt>
                                <dd className="font-medium tabular-nums">
                                    {formatDuration(minutes).replace(/h(\d+)min$/, 'h$1')}
                                </dd>
                            </div>
                        </dl>
                        {isError && <StaleDataNotice subject="as turmas" className="mt-2" />}
                    </>
                )}
            </div>
            <UpcomingDates
                dates={upcomingSemesterDates(
                    today,
                    semester.events,
                    classrooms,
                    activities.data?.items
                )}
            >
                {activities.isLoadingError ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <p className="text-muted-foreground">
                            Não foi possível carregar as avaliações.
                        </p>
                        <Button variant="link" size="sm" onClick={() => void activities.refetch()}>
                            Tentar novamente
                        </Button>
                    </div>
                ) : activities.isError ? (
                    <StaleDataNotice subject="as avaliações" />
                ) : null}
            </UpcomingDates>
        </>
    );
}

function UpcomingDates({
    dates,
    children
}: {
    dates: ReturnType<typeof upcomingSemesterDates>;
    children?: ReactNode;
}) {
    if (dates.length === 0 && !children) return null;

    return (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
            <h3 className="flex items-center gap-1.5 font-medium">
                <CalendarClock aria-hidden="true" className="size-3.5 text-primary" />
                Próximas datas
            </h3>
            {dates.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm">
                    {dates.slice(0, 3).map(({ id, date, title, classroom }) => (
                        <li key={id} className="flex gap-3">
                            <time
                                dateTime={date}
                                className="w-11 shrink-0 font-medium text-primary tabular-nums"
                            >
                                {formatClassroomDate(date).slice(0, 5)}
                            </time>
                            {classroom ? (
                                <Link
                                    to="/turmas/$id"
                                    params={{ id: classroom.id }}
                                    search={{ tab: 'posts' }}
                                    className="min-w-0 wrap-anywhere text-muted-foreground hover:text-foreground hover:underline"
                                >
                                    {title} · {classroom.subject.code}
                                </Link>
                            ) : (
                                <span className="text-muted-foreground">{title}</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {children}
        </div>
    );
}
