import type { PlannedClass } from '@followw/core/lib/planned-schedule.ts';

import { STORAGE_KEYS } from '@followw/core/lib/storage-keys.ts';

import { storedValue } from '#/lib/local-storage';

const EMPTY: PlannedClass[] = [];
export const plannedSchedule = storedValue(STORAGE_KEYS.SCHEDULE, EMPTY);
