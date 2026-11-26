import { coursesQueryOptions } from './courses.ts';
import { professorsQueryOptions } from './professors.ts';

export type CatalogCategory = 'courses' | 'professors';

/** Catálogo completo, mostrado nas abas de cursos e docentes sem texto de busca. */
export const catalogQueryOptions = {
    courses: coursesQueryOptions(null),
    professors: professorsQueryOptions(null)
};
