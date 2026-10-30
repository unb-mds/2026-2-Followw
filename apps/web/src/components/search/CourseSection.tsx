import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from '@tanstack/react-router';
import { GraduationCap } from 'lucide-react';
import { useState } from 'react';

import { ErrorCard } from '#/components/ErrorState';
import { LoadingText } from '#/components/LoadingText';
import { Button } from '#/components/ui/button';
import { validateFlowSearch } from '#/lib/curriculum/navigation';
import { useOnline } from '#/lib/online';
import { titleCase } from '#/lib/profile';
import { coursesQueryOptions, filterCourses } from '#/queries/courses';

const INITIAL_LIMIT = 5;

export function CourseSection({ text, showEmpty = false }: { text: string; showEmpty?: boolean }) {
    const [limit, setLimit] = useState(INITIAL_LIMIT);
    const searchStr = useLocation({ select: (location) => location.searchStr });
    const search = validateFlowSearch(Object.fromEntries(new URLSearchParams(searchStr)));
    const { data, isPending, isFetching, isLoadingError, isError, refetch } = useQuery({
        ...coursesQueryOptions,
        enabled: Boolean(text)
    });
    const online = useOnline();
    if (!text) return null;
    const courses = filterCourses(data ?? [], text);
    if (!showEmpty && !isPending && !isError && courses.length === 0) return null;

    return (
        <section aria-label="Cursos" aria-busy={isFetching} className="flex flex-col gap-3">
            {isLoadingError ? (
                <ErrorCard message="Não foi possível buscar os cursos." onRetry={() => refetch()} />
            ) : isPending ? (
                <LoadingText className="justify-center">Buscando cursos...</LoadingText>
            ) : (
                <>
                    {isError && online && (
                        <ErrorCard
                            message="Não foi possível atualizar os cursos. Exibindo os dados salvos."
                            onRetry={() => refetch()}
                        />
                    )}
                    {courses.length === 0 && showEmpty && (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            Nenhum curso encontrado. Tente mudar a busca.
                        </p>
                    )}
                    {courses.length > 0 && (
                        <>
                            <div className="flex items-baseline justify-between gap-3">
                                <h2 className="text-base font-bold text-foreground">Cursos</h2>
                                <span className="text-xs text-muted-foreground">
                                    {`${courses.length} ${courses.length === 1 ? 'curso' : 'cursos'}`}
                                </span>
                            </div>
                            <div className="flex flex-col gap-3">
                                {courses.slice(0, limit).map((course) => (
                                    <Link
                                        key={course.id}
                                        to="/cursos/$id"
                                        params={{ id: course.id }}
                                        search={{
                                            q: search.q,
                                            category: search.category
                                        }}
                                        state={() => ({
                                            flowReturnScroll:
                                                typeof window === 'undefined' ? 0 : window.scrollY
                                        })}
                                        aria-description="Abrir fluxograma do curso"
                                        className="flex items-center gap-4 rounded-2xl border bg-card p-5 text-card-foreground transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                    >
                                        <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                            <GraduationCap className="size-8" aria-hidden="true" />
                                        </div>
                                        <div className="flex min-w-0 flex-col gap-2">
                                            <h3 className="text-base leading-snug font-semibold">
                                                {titleCase(course.name)}
                                            </h3>
                                            <p className="text-sm font-medium text-primary">
                                                {/* Os cursos semeados do catálogo do SIGAA são de graduação. */}
                                                {course.sigaa_id != null ? 'Graduação' : 'Curso'}
                                                {course.shift && ` · ${titleCase(course.shift)}`}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {titleCase(course.unit.name)}
                                            </p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                            {courses.length > limit && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setLimit((prev) => prev + INITIAL_LIMIT)}
                                    className="mt-1 self-center text-xs"
                                >
                                    {`Ver mais cursos (${courses.length - limit} restantes)`}
                                </Button>
                            )}
                        </>
                    )}
                </>
            )}
        </section>
    );
}
