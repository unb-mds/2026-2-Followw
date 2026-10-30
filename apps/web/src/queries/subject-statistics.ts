import type { SubjectClassroom } from '#/queries/subjects';

import { api } from '#/queries/api';

export const subjectStatisticsQueryOptions = (code: string, classroom: SubjectClassroom) =>
    api.queryOptions('get', '/public/subjects/{code}/statistics', {
        params: {
            path: { code },
            query: { semester: classroom.semester, number: classroom.number }
        }
    });
