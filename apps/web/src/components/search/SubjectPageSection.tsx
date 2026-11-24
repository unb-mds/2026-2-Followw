import type { PlannedClass } from '@followw/core/lib/planned-schedule.ts';
import type { SubjectPage, SubjectsQuery } from '@followw/core/queries/subjects.ts';

import { useNextPages } from '@followw/core/queries/pages.ts';
import {
    availableSubjects,
    subjectsQueryOptions,
    withoutScheduleConflicts
} from '@followw/core/queries/subjects.ts';
import { noop, useQueryClient } from '@tanstack/react-query';

import { TurmaSection } from '#/components/search/TurmaSection';
import { Button } from '#/components/ui/button';
import { refreshQuery } from '#/queries/refresh';

export function SubjectPageSection({
    first,
    query,
    title,
    currentPeriod,
    planned,
    availability,
    taken,
    refreshFirst,
    placeholder = false,
    empty
}: {
    first: SubjectPage;
    query: SubjectsQuery;
    title: string;
    currentPeriod: number | null;
    planned?: readonly PlannedClass[];
    availability?: Set<string> | null;
    taken: Set<string> | null;
    refreshFirst: () => void;
    placeholder?: boolean;
    empty?: string;
}) {
    const client = useQueryClient();
    const pageOptions = (page: number) => subjectsQueryOptions({ ...query, page });
    const pages = useNextPages(first, pageOptions);
    const compatible = withoutScheduleConflicts(pages.items, planned);
    const subjects =
        availability === undefined ? compatible : availableSubjects(compatible, availability);
    return (
        <>
            <TurmaSection
                title={title}
                subjects={subjects}
                currentPeriod={currentPeriod}
                taken={taken}
                onOpenDetails={({ code }) => {
                    if (placeholder) return;
                    const index = pages.items.findIndex((subject) => subject.code === code);
                    const page = Math.floor(index / first.page_size) + 1;
                    if (page <= 1) refreshFirst();
                    else void refreshQuery(client, pageOptions(page)).catch(noop);
                }}
            />
            {!placeholder &&
                (empty || (availability !== undefined && compatible.length > 0)) &&
                subjects.length === 0 &&
                !pages.remaining && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        {empty ?? 'Nenhuma matéria disponível.'}
                    </p>
                )}
            {pages.failed && (
                <p className="text-center text-xs text-destructive">
                    Não foi possível carregar mais matérias.
                </p>
            )}
            {!placeholder && pages.remaining > 0 && (
                <Button
                    type="button"
                    variant="outline"
                    className="self-center"
                    disabled={pages.loading}
                    onClick={pages.loadMore}
                >
                    {pages.loading ? 'Carregando...' : 'Mostrar mais'}
                </Button>
            )}
        </>
    );
}
