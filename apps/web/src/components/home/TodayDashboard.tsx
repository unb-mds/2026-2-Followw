import { useQuery } from '@tanstack/react-query';

import type { Day } from '#/lib/schedule';
import type { UserProfile } from '#/queries/me';

import { getNoClassReason } from '#/calendar';
import { LatestNewsSection } from '#/components/home/LatestNewsSection';
import { PublicInfoSection } from '#/components/home/PublicInfoSection';
import { TodayClassesSection } from '#/components/home/TodayClassesSection';
import { classesOn } from '#/lib/schedule';
import { classroomsQueryOptions } from '#/queries/classrooms';
import { campusOf, menuQueryOptions } from '#/queries/restaurant';

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
            {user && <LatestNewsSection />}
        </div>
    );
}
