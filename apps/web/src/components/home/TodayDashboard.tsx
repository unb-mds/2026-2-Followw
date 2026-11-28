import type { Day } from '@followw/core/lib/schedule.ts';
import type { ReactNode } from 'react';

import { lessonsOn } from '@followw/core/lib/schedule.ts';
import { weekLessonsQueryOptions } from '@followw/core/queries/lessons.ts';
import { campusOf, useMenuPreview } from '@followw/core/queries/restaurant.ts';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronRight, ClipboardList } from 'lucide-react';

import type { UserProfile } from '#/queries/me';

import { PublicInfoSection } from '#/components/home/PublicInfoSection';
import { SemesterSection } from '#/components/home/SemesterSection';
import { TodayClassesSection } from '#/components/home/TodayClassesSection';
import { buttonVariants } from '#/components/ui/button';
import { cn } from '#/lib/shadcn';

interface TodayDashboardProps {
    user: UserProfile | null;
    day: Day;
    now: Day & { time: string };
    label: string;
    dayPicker?: ReactNode;
}

export function TodayDashboard({ user, day, now, label, dayPicker }: TodayDashboardProps) {
    const lessons = useQuery({ ...weekLessonsQueryOptions, enabled: Boolean(user) });
    const campus = campusOf(user?.unit?.code);
    const preview = useMenuPreview({ campus, date: day.date, now });
    const selected = lessons.data?.find((item) => item.date === day.date);
    const time = day.date === now.date ? now.time : undefined;
    const classes = lessonsOn(selected?.lessons ?? [], day.weekday, time);

    return (
        <div className="home-columns flex flex-col gap-6 lg:grid lg:items-start lg:gap-x-10 lg:gap-y-0">
            <div
                className={cn(
                    'min-w-0 empty:hidden',
                    user &&
                        'lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:grid lg:grid-rows-subgrid lg:self-stretch'
                )}
            >
                {dayPicker && <div className="contents lg:row-start-1 lg:block">{dayPicker}</div>}
                <TodayClassesSection
                    loggedIn={Boolean(user)}
                    className={
                        user
                            ? 'lg:row-span-2 lg:row-start-2 lg:grid lg:grid-rows-subgrid lg:items-start'
                            : undefined
                    }
                    noClassReason={selected?.no_class_reason ?? undefined}
                    isLoadingError={lessons.isLoadingError}
                    onRetry={() => void lessons.refetch()}
                    classes={classes}
                    date={day.date}
                    now={now}
                />
            </div>
            <aside
                className={cn(
                    'flex min-w-0 flex-col gap-6 lg:gap-8',
                    user && 'lg:col-start-2 lg:row-start-3'
                )}
            >
                {user && (
                    <Link
                        to="/avaliacao-institucional"
                        preload={false}
                        className={cn(
                            buttonVariants({ variant: 'outline' }),
                            'h-auto min-h-12 w-full justify-start gap-3 px-4 py-2'
                        )}
                    >
                        <ClipboardList className="size-5 text-primary" aria-hidden="true" />
                        <span className="flex-1 text-left">Avaliação institucional</span>
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                    </Link>
                )}
                <PublicInfoSection
                    campus={campus}
                    menus={preview.menus}
                    isLoading={preview.isLoading}
                    day={label}
                    date={day.date}
                    now={now}
                />
                <SemesterSection today={now.date} loggedIn={Boolean(user)} />
            </aside>
        </div>
    );
}
