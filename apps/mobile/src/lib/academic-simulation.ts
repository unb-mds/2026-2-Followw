import type { SimulatedGrades } from '@followw/core/lib/academic-simulation.ts';

import { STORAGE_KEYS, storedValue } from '@/lib/storage';

export const simulatedGrades = storedValue<SimulatedGrades>(STORAGE_KEYS.ACADEMIC_SIMULATION, {});
