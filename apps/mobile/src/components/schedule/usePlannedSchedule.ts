import type { PlannedClass } from '@followw/core/lib/planned-schedule.ts';

import { addError, classKey } from '@followw/core/lib/planned-schedule.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { toast } from '@/components/ui/toast';
import { STORAGE_KEYS, storedValue } from '@/lib/storage';

const EMPTY: PlannedClass[] = [];
const plannedSchedule = storedValue(STORAGE_KEYS.SCHEDULE, EMPTY);

export function usePlannedSchedule() {
    const items = useSyncExternalStore(
        plannedSchedule.subscribe,
        plannedSchedule.getSnapshot,
        plannedSchedule.getSnapshot
    );
    const { data: user } = useQuery(meQueryOptions);
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
