import { titleCase } from '@followw/core/lib/profile.ts';
import { type CoursePage, coursesQueryOptions } from '@followw/core/queries/courses.ts';
import { Link } from '@tanstack/react-router';
import { GraduationCap } from 'lucide-react';

import { PagedSection } from '#/components/search/PagedSection';

export function CourseSection({
    page,
    q,
    onShowAll
}: {
    page: CoursePage;
    q: string | null;
    onShowAll?: () => void;
}) {
    return (
        <PagedSection
            title="Cursos"
            count={`${page.total} ${page.total === 1 ? 'curso' : 'cursos'}`}
            noun="cursos"
            first={page}
            pageOptions={(number) => coursesQueryOptions(q, number)}
            onShowAll={onShowAll}
        >
            {(courses) => (
                <div className="flex flex-col gap-3">
                    {courses.map((course) => (
                        <Link
                            key={course.id}
                            to="/cursos/$id"
                            params={{ id: course.id }}
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
                                    {course.level ?? 'Curso'}
                                    {course.shift && ` · ${titleCase(course.shift)}`}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {titleCase(course.unit.name)}
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </PagedSection>
    );
}
