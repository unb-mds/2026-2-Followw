import type { SubjectPage, SubjectsQuery } from '@followw/core/queries/subjects.ts';

import { resultsSummary } from '@followw/core/lib/subject-filters.ts';
import { useNextPages } from '@followw/core/queries/pages.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { subjectsQueryOptions } from '@followw/core/queries/subjects.ts';
import { noop, useQueryClient } from '@tanstack/react-query';

import { TurmaSection } from '@/components/search/TurmaSection';
import { useSubjectListing } from '@/components/search/useSubjectListing';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

/** O total do servidor; as ocultas por conflito são só as já carregadas. */
export function SubjectPageSection({
    first,
    query,
    title,
    refreshFirst,
    placeholder = false,
    empty
}: {
    first: SubjectPage;
    query: SubjectsQuery;
    title: string;
    refreshFirst: () => void;
    placeholder?: boolean;
    // mensagem quando a busca não encontra nada; sem ela, a seção some
    empty?: string;
}) {
    const client = useQueryClient();
    const { currentPeriod, taken, visible } = useSubjectListing();
    const pageOptions = (page: number) => subjectsQueryOptions({ ...query, page });
    const pages = useNextPages(first, pageOptions);
    const subjects = visible(pages.items);
    const hidden = pages.items.length - subjects.length;
    const allHidden = subjects.length === 0 && hidden > 0;
    const exhausted = !placeholder && subjects.length === 0 && !pages.remaining;
    return (
        <>
            {first.total > 0 && (
                <TurmaSection
                    title={title}
                    summary={resultsSummary(first.total, hidden)}
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
            )}
            {allHidden && !placeholder && (
                <Text className="py-8 text-center text-sm text-muted-foreground">
                    {pages.remaining
                        ? 'As matérias carregadas conflitam com a sua grade. Mostre mais para continuar.'
                        : 'Todas as matérias encontradas conflitam com a sua grade.'}
                </Text>
            )}
            {exhausted && !allHidden && empty && (
                <Text className="py-8 text-center text-sm text-muted-foreground">{empty}</Text>
            )}
            {pages.failed && (
                <Text className="text-center text-xs text-destructive">
                    Não foi possível carregar mais matérias.
                </Text>
            )}
            {!placeholder && pages.remaining > 0 && (
                <Button
                    variant="outline"
                    className="self-center"
                    disabled={pages.loading}
                    onPress={pages.loadMore}
                >
                    <Text>{pages.loading ? 'Carregando...' : 'Mostrar mais'}</Text>
                </Button>
            )}
        </>
    );
}
