import type { Day } from '@followw/core/lib/schedule.ts';

import { getNoClassReason } from '@followw/core/calendar.ts';
import { classesOn } from '@followw/core/lib/schedule.ts';
import { classroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { campusOf, menuQueryOptions } from '@followw/core/queries/restaurant.ts';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';

import type { UserProfile } from '#/queries/me';

import { PublicInfoSection } from '#/components/home/PublicInfoSection';
import { TodayClassesSection } from '#/components/home/TodayClassesSection';

const LatestNewsSection = lazy(() =>
    import('#/components/home/LatestNewsSection').then((module) => ({
        default: module.LatestNewsSection
    }))
);

interface TodayDashboardProps {
    user: UserProfile | null;
    day: Day;
    time?: string;
    label: string;
}

export function TodayDashboard({ user, day, time, label }: TodayDashboardProps) {
    const classrooms = useQuery({ ...classroomsQueryOptions, enabled: Boolean(user) });
    const campus = campusOf(user?.unit?.code);
    const menu = useQuery(menuQueryOptions({ date: day.date, campus }));
    const noClassReason = getNoClassReason(day.date);
    const classes = noClassReason ? [] : classesOn(classrooms.data ?? [], day.weekday, time);

    return (
        <div className="flex flex-col gap-6">
            <TodayClassesSection
                loggedIn={Boolean(user)}
                noClassReason={noClassReason}
                isLoadingError={classrooms.isLoadingError}
                onRetry={() => void classrooms.refetch()}
                classes={classes}
            />
            <PublicInfoSection
                campus={campus}
                menu={menu.data?.[0]}
                isLoading={menu.isPending}
                day={label}
            />
            {user && (
                <Suspense fallback={null}>
                    <LatestNewsSection />
                </Suspense>
            )}
        </div>
    );
}
