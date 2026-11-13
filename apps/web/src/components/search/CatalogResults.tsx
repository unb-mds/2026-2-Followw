import type { ReactNode } from 'react';

import { coursesQueryOptions } from '@followw/core/queries/courses.ts';
import { professorsQueryOptions } from '@followw/core/queries/professors.ts';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';

import { QueryState } from '#/components/QueryState';
import { CourseSection } from '#/components/search/CourseSection';
import { ProfessorSection } from '#/components/search/ProfessorSection';

export type CatalogCategory = 'courses' | 'professors';

export const catalogQueryOptions = {
    courses: coursesQueryOptions(null),
    professors: professorsQueryOptions(null)
};

/** Sem texto, as abas Cursos e Docentes listam o catálogo inteiro. */
export function CatalogResults({ category }: { category: CatalogCategory }) {
    return category === 'courses' ? <CourseCatalog /> : <ProfessorCatalog />;
}

function CourseCatalog() {
    return (
        <Catalog
            query={useQuery(catalogQueryOptions.courses)}
            noun="cursos"
            empty="Nenhum curso cadastrado."
        >
            {(page) => <CourseSection page={page} q={null} />}
        </Catalog>
    );
}

function ProfessorCatalog() {
    return (
        <Catalog
            query={useQuery(catalogQueryOptions.professors)}
            noun="docentes"
            empty="Nenhum docente cadastrado."
        >
            {(page) => <ProfessorSection page={page} q={null} />}
        </Catalog>
    );
}

function Catalog<T extends { total: number }>({
    query,
    noun,
    empty,
    children
}: {
    query: UseQueryResult<T, unknown>;
    noun: string;
    empty: string;
    children: (page: T) => ReactNode;
}) {
    return (
        <QueryState
            query={query}
            loading={`Carregando ${noun}...`}
            error={`Não foi possível carregar os ${noun}.`}
            stale={`Não foi possível atualizar os ${noun}. Exibindo os dados salvos.`}
            className="justify-center"
        >
            {(page) =>
                page.total ? (
                    children(page)
                ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
                )
            }
        </QueryState>
    );
}
