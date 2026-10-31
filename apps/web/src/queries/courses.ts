import type { components } from '#/queries/schema.gen';

import { api } from '#/queries/api';

export type PublicCourse = components['schemas']['PublicCourse'];

export const coursesQueryOptions = api.queryOptions('get', '/public/courses');

const normalize = (text: string) =>
    text
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLocaleLowerCase('pt-BR')
        .trim()
        .replace(/\s+/g, ' ');

export function filterCourses(courses: PublicCourse[], text: string): PublicCourse[] {
    const terms = normalize(text).split(' ').filter(Boolean);
    if (!terms.length) return [];
    return courses.filter((course) => {
        const name = normalize(course.name);
        return terms.every((term) => name.includes(term));
    });
}
