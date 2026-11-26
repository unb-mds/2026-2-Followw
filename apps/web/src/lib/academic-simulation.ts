import type { SimulatedGrades } from '@followw/core/lib/academic-simulation.ts';

import { STORAGE_KEYS } from '@followw/core/lib/storage-keys.ts';

import { storedValue } from '#/lib/local-storage';

export const simulatedGrades = storedValue<SimulatedGrades>(STORAGE_KEYS.ACADEMIC_SIMULATION, {});
