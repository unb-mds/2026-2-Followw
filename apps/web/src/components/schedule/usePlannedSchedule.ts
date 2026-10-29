import { useSuspenseQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import type { PlannedClass } from '#/lib/planned-schedule';

import { toast } from '#/components/ui/toast';
import { addError, classKey, plannedSchedule } from '#/lib/planned-schedule';
import { meQueryOptions } from '#/queries/me';

export function usePlannedSchedule() {
    const items = useSyncExternalStore(
        plannedSchedule.subscribe,
        plannedSchedule.getSnapshot,
        plannedSchedule.getServerSnapshot
    );
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const maxHours = user?.period_max_workload ?? null;
    const has = (item: PlannedClass) => items.some((entry) => classKey(entry) === classKey(item));

    const toggle = (item: PlannedClass) => {
        if (has(item)) {
            plannedSchedule.set(items.filter((entry) => classKey(entry) !== classKey(item)));
            return;
        }
        const description = addError(items, item, maxHours);
        if (description) {
            toast.add({
                id: 'schedule-conflict',
                type: 'warning',
                title: 'Não foi possível adicionar à grade',
                description
            });
        } else plannedSchedule.set([...items, item]);
    };

    return { items, maxHours, has, toggle, clear: plannedSchedule.clear };
}
