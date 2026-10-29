import { Link } from '@tanstack/react-router';
import { BookOpen, Calendar, GraduationCap, Lightbulb, type LucideIcon, User } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ProfessorDegree, ProfessorDetails, ProfessorDiscipline } from '#/queries/professors';

import { Button } from '#/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card';
import { titleCase } from '#/lib/profile';

const INITIAL_SEMESTERS_COUNT = 6;

// semestres do mais recente ao mais antigo, matérias por código
function groupBySemester(disciplines: ProfessorDiscipline[]) {
    const groups = new Map<string, ProfessorDiscipline[]>();
    for (const item of disciplines) {
        const group = groups.get(item.semester);
        if (group) group.push(item);
        else groups.set(item.semester, [item]);
    }
    return [...groups]
        .toSorted(([a], [b]) => b.localeCompare(a))
        .map(([semester, items]) => ({
            semester,
            items: items.toSorted((a, b) => a.code.localeCompare(b.code))
        }));
}

export function ProfessorDetailsSection({ professor }: { professor: ProfessorDetails }) {
    const [showAllSemesters, setShowAllSemesters] = useState(false);
    const semesters = useMemo(
        () => groupBySemester(professor.disciplines),
        [professor.disciplines]
    );
    const hiddenSemesters = semesters.length - INITIAL_SEMESTERS_COUNT;
    const displayedSemesters = showAllSemesters
        ? semesters
        : semesters.slice(0, INITIAL_SEMESTERS_COUNT);

    return (
        <div className="flex flex-col gap-4">
            {professor.description && (
                <DetailCard
                    icon={User}
                    title="Sobre"
                    className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground"
                >
                    {professor.description}
                </DetailCard>
            )}

            {professor.interests && (
                <DetailCard
                    icon={Lightbulb}
                    title="Áreas de Interesse"
                    className="text-sm leading-relaxed text-muted-foreground"
                >
                    {professor.interests}
                </DetailCard>
            )}

            {professor.education.length > 0 && (
                <DetailCard icon={GraduationCap} title="Formação Acadêmica">
                    <ul className="flex flex-col gap-3">
                        {professor.education.map((degree) => (
                            <DegreeItem
                                key={`${degree.level}-${degree.course ?? ''}-${degree.institution ?? ''}-${degree.start_year ?? ''}`}
                                degree={degree}
                            />
                        ))}
                    </ul>
                </DetailCard>
            )}

            {semesters.length > 0 && (
                <DetailCard
                    icon={BookOpen}
                    title="Disciplinas de Graduação Ministradas"
                    className="flex flex-col gap-5"
                >
                    {displayedSemesters.map((group) => (
                        <div key={group.semester} className="flex flex-col gap-2">
                            <h3 className="text-sm font-bold text-foreground">{group.semester}</h3>
                            <ul className="flex flex-col gap-1.5">
                                {group.items.map((item) => (
                                    <DisciplineItem key={item.code} item={item} />
                                ))}
                            </ul>
                        </div>
                    ))}

                    {hiddenSemesters > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAllSemesters((prev) => !prev)}
                            className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground"
                        >
                            {showAllSemesters
                                ? 'Mostrar menos semestres'
                                : `Ver mais semestres (${hiddenSemesters} restantes)`}
                        </Button>
                    )}
                </DetailCard>
            )}
        </div>
    );
}

function DetailCard({
    icon: Icon,
    title,
    className,
    children
}: {
    icon: LucideIcon;
    title: string;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Icon className="size-4 text-primary" aria-hidden="true" />
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className={className}>{children}</CardContent>
        </Card>
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
        <li className="flex items-baseline gap-2 text-sm">
            <Link
                to="/buscar"
                search={{ q: item.code }}
                className="text-foreground transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
                aria-label={`Buscar ${item.name ?? `matéria ${item.code}`}`}
            >
                {item.name ?? 'Matéria desconhecida'}
            </Link>
            {item.occurrences > 1 && (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {item.occurrences} turmas
                </span>
            )}
        </li>
    );
}
