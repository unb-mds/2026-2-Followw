import { coursesQueryOptions } from '@followw/core/queries/courses.ts';
import { professorsQueryOptions } from '@followw/core/queries/professors.ts';

export const catalogQueryOptions = {
    courses: coursesQueryOptions(null),
    professors: professorsQueryOptions(null)
};
