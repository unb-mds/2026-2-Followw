import { Link } from '@tanstack/react-router';
import { GraduationCap } from 'lucide-react';
import { useState } from 'react';

import type { PublicCourse } from '#/queries/courses';

import { Button } from '#/components/ui/button';
import { titleCase } from '#/lib/profile';

const INITIAL_LIMIT = 5;

export function CourseSection({ courses }: { courses: PublicCourse[] }) {
    const [limit, setLimit] = useState(INITIAL_LIMIT);
    if (courses.length === 0) return null;

    return (
        <section aria-label="Cursos" className="flex flex-col gap-3">
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
        </section>
    );
}
