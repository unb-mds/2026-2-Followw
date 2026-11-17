import type { SearchType } from '../queries/search.ts';

export const SEARCH_CATEGORIES = [
    'all',
    'classrooms',
    'electives',
    'courses',
    'professors',
    'internships'
] as const;
export type SearchCategory = (typeof SEARCH_CATEGORIES)[number];

export const searchCategoryLabels: Record<SearchCategory, string> = {
    all: 'Todos',
    classrooms: 'Turmas',
    electives: 'Optativas',
    courses: 'Cursos',
    professors: 'Docentes',
    internships: 'Estágios'
};

/** Tipos que cada aba pede à busca; Todos não filtra. */
export const searchTypes: Record<SearchCategory, SearchType[] | undefined> = {
    all: undefined,
    classrooms: ['subjects'],
    electives: undefined,
    courses: ['courses'],
    professors: ['professors'],
    internships: undefined
};

export const searchEmptyMessages: Record<SearchCategory, string> = {
    all: 'Nenhum resultado encontrado. Tente mudar a busca.',
    classrooms: 'Nenhuma matéria encontrada. Tente mudar a busca.',
    electives: 'Nenhuma optativa encontrada para esta busca.',
    courses: 'Nenhum curso encontrado. Tente mudar a busca.',
    professors: 'Nenhum docente encontrado. Tente mudar a busca.',
    internships: 'Nenhum estágio encontrado. Tente mudar a busca.'
};

export const showsSubjects = (category: SearchCategory) =>
    category === 'all' || category === 'classrooms';
