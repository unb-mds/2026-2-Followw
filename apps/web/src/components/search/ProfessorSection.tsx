import { useState } from 'react';

import type { ProfessorItem } from '#/queries/professors';

import { ProfessorCard } from '#/components/search/ProfessorCard';
import { Button } from '#/components/ui/button';

const INITIAL_LIMIT = 5;

export function ProfessorSection({ professors }: { professors: ProfessorItem[] }) {
    const [limit, setLimit] = useState(INITIAL_LIMIT);

    if (professors.length === 0) return null;

    const visibleProfessors = professors.slice(0, limit);
    const hasMore = professors.length > limit;

    return (
        <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-bold text-foreground">Docentes</h2>
                <span className="shrink-0 text-xs text-muted-foreground">
                    {`${professors.length} ${professors.length === 1 ? 'docente encontrado' : 'docentes encontrados'}`}
                </span>
            </div>
            <div className="flex flex-col gap-2">
                {visibleProfessors.map((professor) => (
                    <ProfessorCard key={professor.siape} professor={professor} />
                ))}
            </div>
            {hasMore && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setLimit((prev) => prev + INITIAL_LIMIT)}
                    className="mt-1 self-center text-xs"
                >
                    {`Ver mais docentes (${professors.length - limit} restantes)`}
                </Button>
            )}
        </section>
    );
}
