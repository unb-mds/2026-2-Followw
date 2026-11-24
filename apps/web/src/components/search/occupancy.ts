import type { Occupancy } from '@followw/core/queries/subjects.ts';

export const OCCUPANCY_COLOR: Record<Occupancy, string> = {
    free: 'text-primary',
    filling: 'text-warning',
    full: 'text-destructive'
};
