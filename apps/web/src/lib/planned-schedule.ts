import type { SubjectClassroom } from '#/queries/subjects';

import { localStorageRepository, STORAGE_KEYS } from '#/lib/local-storage';

export interface PlannedClass {
    code: string;
    name: string;
    hours: number | null;
    classroom: SubjectClassroom;
}

const EMPTY: PlannedClass[] = [];
const listeners = new Set<() => void>();
let snapshot: PlannedClass[] | undefined;

function notify() {
    for (const listener of listeners) listener();
}

export const plannedSchedule = {
    getSnapshot: () => {
        return (snapshot ??=
            localStorageRepository
                .get<PlannedClass[]>(STORAGE_KEYS.SCHEDULE)
                ?.filter((entry) => 'hours' in entry) ?? EMPTY);
    },
    getServerSnapshot: () => EMPTY,
    subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
            if (listeners.size === 0) snapshot = undefined;
        };
    },
    set: (items: PlannedClass[]) => {
        snapshot = items;
        localStorageRepository.set(STORAGE_KEYS.SCHEDULE, items);
        notify();
    },
    clear: () => {
        snapshot = EMPTY;
        localStorageRepository.remove(STORAGE_KEYS.SCHEDULE);
        notify();
    }
};
