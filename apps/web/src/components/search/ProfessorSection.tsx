import { m } from 'motion/react';

import { PagedSection } from '#/components/search/PagedSection';
import { ProfessorCard } from '#/components/search/ProfessorCard';
import { rise, useEntrance } from '#/lib/motion';
import { type ProfessorPage, professorsQueryOptions } from '#/queries/professors';

export function ProfessorSection({
    page,
    q,
    onShowAll
}: {
    page: ProfessorPage;
    q: string | null;
    onShowAll?: () => void;
}) {
    const entrance = useEntrance();
    return (
        <PagedSection
            title="Docentes"
            count={`${page.total} ${page.total === 1 ? 'docente encontrado' : 'docentes encontrados'}`}
            noun="docentes"
            first={page}
            pageOptions={(number) => professorsQueryOptions(q, number)}
            onShowAll={onShowAll}
        >
            {(professors) => (
                <m.div className="flex flex-col gap-2" {...entrance}>
                    {professors.map((professor, index) => (
                        <m.div
                            key={professor.siape}
                            custom={index % page.items.length}
                            variants={rise}
                        >
                            <ProfessorCard professor={professor} />
                        </m.div>
                    ))}
                </m.div>
            )}
        </PagedSection>
    );
}
