import { Link } from '@tanstack/react-router';
import { BookOpen, Calendar, GraduationCap, Lightbulb, User } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ProfessorDegree, ProfessorDetails, ProfessorDiscipline } from '#/queries/professors';

import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card';
import { titleCase } from '#/lib/profile';

const INITIAL_SEMESTERS_COUNT = 6;

export function ProfessorDetailsSection({ professor }: { professor: ProfessorDetails }) {
    const [showAllSemesters, setShowAllSemesters] = useState(false);

    const disciplinesBySemester = useMemo(() => {
        const groups = new Map<string, ProfessorDiscipline[]>();
        for (const item of professor.disciplines ?? []) {
            const list = groups.get(item.semester) ?? [];
            list.push(item);
            groups.set(item.semester, list);
        }

        const sortedSemesters = Array.from(groups.keys()).toSorted((a, b) => b.localeCompare(a));
        return sortedSemesters.map((sem) => ({
            semester: sem,
            items: (groups.get(sem) ?? []).toSorted((a, b) => a.code.localeCompare(b.code))
        }));
    }, [professor.disciplines]);

    const displayedSemesters = showAllSemesters
        ? disciplinesBySemester
        : disciplinesBySemester.slice(0, INITIAL_SEMESTERS_COUNT);

    return (
        <div className="flex flex-col gap-4">
            {professor.description && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <User className="size-4 text-primary" aria-hidden="true" />
                            Sobre
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                        {professor.description}
                    </CardContent>
                </Card>
            )}

            {professor.interests && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Lightbulb className="size-4 text-primary" aria-hidden="true" />
                            Áreas de Interesse
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm leading-relaxed text-muted-foreground">
                        {professor.interests}
                    </CardContent>
                </Card>
            )}

            {professor.education && professor.education.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <GraduationCap className="size-4 text-primary" aria-hidden="true" />
                            Formação Acadêmica
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="flex flex-col gap-3">
                            {professor.education.map((degree) => (
                                <DegreeItem
                                    key={`${degree.level}-${degree.course ?? ''}-${degree.institution ?? ''}-${degree.start_year ?? ''}`}
                                    degree={degree}
                                />
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            {disciplinesBySemester.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <BookOpen className="size-4 text-primary" aria-hidden="true" />
                            Disciplinas de Graduação Ministradas
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-5">
                        {displayedSemesters.map((group) => (
                            <div key={group.semester} className="flex flex-col gap-2">
                                <h3 className="text-sm font-bold text-foreground">
                                    {group.semester}
                                </h3>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {group.items.map((item) => (
                                        <DisciplineItem
                                            key={`${item.semester}-${item.code}`}
                                            item={item}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}

                        {disciplinesBySemester.length > INITIAL_SEMESTERS_COUNT && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAllSemesters((prev) => !prev)}
                                className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground"
                            >
                                {showAllSemesters
                                    ? 'Mostrar menos semestres'
                                    : `Ver mais semestres (${disciplinesBySemester.length - INITIAL_SEMESTERS_COUNT} restantes)`}
                            </Button>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function DegreeItem({ degree }: { degree: ProfessorDegree }) {
    const period =
        degree.start_year && degree.end_year
            ? `${degree.start_year} - ${degree.end_year}`
            : degree.end_year || degree.start_year || null;

    return (
        <li className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{titleCase(degree.level)}</span>
                {period && (
                    <span className="flex items-center gap-1 text-muted-foreground tabular-nums">
                        <Calendar className="size-3" aria-hidden="true" />
                        {period}
                    </span>
                )}
            </div>
            {degree.course && <p className="font-medium text-foreground/90">{degree.course}</p>}
            {degree.institution && (
                <p className="text-muted-foreground">{titleCase(degree.institution)}</p>
            )}
        </li>
    );
}

function DisciplineItem({ item }: { item: ProfessorDiscipline }) {
    return (
        <Link
            to="/buscar"
            search={{ q: item.code }}
            className="group flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs transition-colors hover:border-primary/50 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Buscar matéria ${item.code}`}
        >
            <span className="font-semibold text-foreground transition-colors group-hover:text-primary">
                {item.code}
            </span>
            {item.occurrences > 1 && (
                <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums">
                    {item.occurrences} turmas
                </Badge>
            )}
        </Link>
    );
}
