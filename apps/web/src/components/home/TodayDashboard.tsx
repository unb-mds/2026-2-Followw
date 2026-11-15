import type { Day } from '@followw/core/lib/schedule.ts';

import { lessonsOn } from '@followw/core/lib/schedule.ts';
import { weekLessonsQueryOptions } from '@followw/core/queries/lessons.ts';
import { campusOf, useMenuPreview } from '@followw/core/queries/restaurant.ts';
import { useQuery } from '@tanstack/react-query';

import type { UserProfile } from '#/queries/me';

import { PublicInfoSection } from '#/components/home/PublicInfoSection';
import { TodayClassesSection } from '#/components/home/TodayClassesSection';

interface TodayDashboardProps {
    user: UserProfile | null;
    day: Day;
    now: Day & { time: string };
    label: string;
}

export function TodayDashboard({ user, day, now, label }: TodayDashboardProps) {
    const lessons = useQuery({ ...weekLessonsQueryOptions, enabled: Boolean(user) });
    const campus = campusOf(user?.unit?.code);
    const preview = useMenuPreview({ campus, date: day.date, now });
    const selected = lessons.data?.find((item) => item.date === day.date);
    const time = day.date === now.date ? now.time : undefined;
    const classes = lessonsOn(selected?.lessons ?? [], day.weekday, time);

    return (
        <div className="home-columns flex flex-col gap-6 lg:grid lg:items-start lg:gap-10">
            <TodayClassesSection
                loggedIn={Boolean(user)}
                noClassReason={selected?.no_class_reason ?? undefined}
                isLoadingError={lessons.isLoadingError}
                onRetry={() => void lessons.refetch()}
                classes={classes}
                date={day.date}
                now={now}
            />
            <aside className="flex min-w-0 flex-col gap-6 lg:gap-8 lg:border-l lg:pl-8">
                <PublicInfoSection
                    campus={campus}
                    menus={preview.menus}
                    isLoading={preview.isLoading}
                    day={label}
                    date={day.date}
                    now={now}
                />
            </aside>
        </div>
    );
}
