import type { components } from '#/queries/schema.gen.ts';

import { api } from '#/queries/api.ts';

export type Classroom = components['schemas']['Classroom'];

export const classroomsQueryOptions = api.queryOptions('get', '/classrooms');
