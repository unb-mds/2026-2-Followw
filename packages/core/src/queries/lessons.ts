import type { components } from './schema.gen.ts';

import { api } from './api.ts';

export type LessonDay = components['schemas']['LessonDay'];
export type WeekLesson = components['schemas']['WeekLesson'];

/** Segunda a domingo da semana atual, com a situação do aluno em cada aula. */
export const weekLessonsQueryOptions = api.queryOptions('get', '/lessons');
