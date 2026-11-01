import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { QueryState } from '#/components/QueryState';
import { CourseSection } from '#/components/search/CourseSection';
import { coursesQueryOptions } from '#/queries/courses';

export function CourseResults({ text }: { text: string }) {
    const result = useQuery({ ...coursesQueryOptions(text), placeholderData: keepPreviousData });
    return (
        <div aria-busy={result.isFetching} className="flex flex-col gap-3">
            <QueryState
                query={result}
                loading="Buscando cursos..."
                error="Não foi possível buscar os cursos."
                stale="Não foi possível atualizar os cursos. Exibindo os dados salvos."
                className="justify-center"
            >
                {(courses) =>
                    courses.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            Nenhum curso encontrado. Tente mudar a busca.
                        </p>
                    ) : (
                        <CourseSection key={text} courses={courses} />
                    )
                }
            </QueryState>
        </div>
    );
}
