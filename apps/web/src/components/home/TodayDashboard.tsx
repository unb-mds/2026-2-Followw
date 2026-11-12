import { useQuery } from '@tanstack/react-query';

import type { Day } from '#/lib/schedule';
import type { UserProfile } from '#/queries/me';

import { getNoClassReason } from '#/calendar';
import { PublicInfoSection } from '#/components/home/PublicInfoSection';
import { TodayClassesSection } from '#/components/home/TodayClassesSection';
import { classesOn } from '#/lib/schedule';
import { classroomsQueryOptions } from '#/queries/classrooms';
import { campusOf, useMenuPreview } from '#/queries/restaurant';

interface TodayDashboardProps {
    user: UserProfile | null;
    day: Day;
    now: Day & { time: string };
    label: string;
}

export function TodayDashboard({ user, day, now, label }: TodayDashboardProps) {
    const classrooms = useQuery({ ...classroomsQueryOptions, enabled: Boolean(user) });
    const campus = campusOf(user?.unit?.code);
    const preview = useMenuPreview({ campus, date: day.date, now });
    const noClassReason = getNoClassReason(day.date);
    const time = day.date === now.date ? now.time : undefined;
    const classes = noClassReason ? [] : classesOn(classrooms.data ?? [], day.weekday, time);

    return (
        <div className="home-columns flex flex-col gap-6 lg:grid lg:items-start lg:gap-10">
            <TodayClassesSection
                loggedIn={Boolean(user)}
                noClassReason={noClassReason}
                isLoadingError={classrooms.isLoadingError}
                onRetry={() => void classrooms.refetch()}
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
