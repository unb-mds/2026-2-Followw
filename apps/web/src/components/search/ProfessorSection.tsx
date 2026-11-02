import { PagedSection } from '#/components/search/PagedSection';
import { ProfessorCard } from '#/components/search/ProfessorCard';
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
                <div className="flex flex-col gap-2">
                    {professors.map((professor) => (
                        <ProfessorCard key={professor.siape} professor={professor} />
                    ))}
                </div>
            )}
        </PagedSection>
    );
}
