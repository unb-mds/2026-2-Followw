import type { CatalogCategory } from '../queries/catalog.ts';
import type { UserProfile } from '../queries/me.ts';
import type { SubjectsQuery } from '../queries/subjects.ts';
import type { SearchCategory } from './search-categories.ts';

import { showRecommendations } from '../queries/recommendations.ts';
import { showsSubjects } from './search-categories.ts';
import { kindsTitle, type SubjectFilterParams, subjectsQueryFrom } from './subject-filters.ts';

export type SearchView =
    | { kind: 'recommendations'; available: boolean }
    | { kind: 'catalog'; category: CatalogCategory }
    | { kind: 'search'; text: string; available: boolean }
    | { kind: 'subjects'; query: SubjectsQuery; title: string }
    | { kind: 'curriculum-login' }
    | { kind: 'internships'; text: string | null };

/** Filtros de matéria levam à lista filtrada; sem texto, recomendações, a unidade do aluno ou o catálogo. */
export function searchView(
    category: SearchCategory,
    q: string,
    text: string | null,
    user: UserProfile | null | undefined,
    filters: SubjectFilterParams
): SearchView | null {
    const subjects = showsSubjects(category);
    const available = filters.hideUnavailable;
    if (subjects && filters.kind.length && !user) return { kind: 'curriculum-login' };
    const query = subjects && subjectsQueryFrom(filters, text);
    if (query) return { kind: 'subjects', query, title: kindsTitle(filters.kind) };
    if (category === 'internships') return { kind: 'internships', text };
    if (subjects && showRecommendations(user, { q })) return { kind: 'recommendations', available };
    if (text) return { kind: 'search', text, available };
    if (category === 'courses' || category === 'professors') return { kind: 'catalog', category };
    const unit = subjects && user?.unit?.code;
    const unitQuery = unit && subjectsQueryFrom(filters, null, unit);
    return unitQuery ? { kind: 'subjects', query: unitQuery, title: `Matérias da ${unit}` } : null;
}

const searchLabels: Partial<Record<SearchCategory, string>> = {
    all: 'Busque por matéria, horário, curso ou professor',
    classrooms: 'Busque por matéria, horário ou departamento',
    internships: 'Busque por estágio'
};

/** Texto do campo de busca; com filtros de matéria, o texto busca só matérias. */
export function searchPlaceholder(category: SearchCategory, filters: SubjectFilterParams) {
    return showsSubjects(category) && subjectsQueryFrom(filters, null)
        ? searchLabels.classrooms!
        : (searchLabels[category] ?? 'Busque por matéria, curso ou professor');
}
