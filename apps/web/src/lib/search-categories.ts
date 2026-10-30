export const SEARCH_CATEGORIES = ['all', 'classrooms', 'courses', 'professors'] as const;
export type SearchCategory = (typeof SEARCH_CATEGORIES)[number];

export const searchCategoryLabels: Record<SearchCategory, string> = {
    all: 'Todos',
    classrooms: 'Matérias',
    courses: 'Cursos',
    professors: 'Docentes'
};

export function searchSections(category: SearchCategory) {
    return {
        classrooms: category === 'all' || category === 'classrooms',
        courses: category === 'all' || category === 'courses',
        professors: category === 'all' || category === 'professors'
    };
}
