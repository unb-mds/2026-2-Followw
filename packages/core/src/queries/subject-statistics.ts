import type { SubjectClassroom } from './subjects.ts';

import { api } from './api.ts';

export const subjectStatisticsQueryOptions = (code: string, classroom: SubjectClassroom) =>
    api.queryOptions('get', '/public/subjects/{code}/statistics', {
        params: {
            path: { code },
            query: { semester: classroom.semester, number: classroom.number }
        }
    });
