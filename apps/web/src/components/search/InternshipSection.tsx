import type { InternshipItem } from '@followw/core/queries/internships.ts';

import { filterInternships, internshipsQueryOptions } from '@followw/core/queries/internships.ts';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';

import { QueryState } from '#/components/QueryState';
import { InternshipCard } from '#/components/search/InternshipCard';
import { InternshipDetailDialog } from '#/components/search/InternshipDetailDialog';
import { Button } from '#/components/ui/button';

export function InternshipSection({
    internships,
    title = 'Estágios',
    previewLimit,
    onShowAll,
    emptyMessage
}: {
    internships: InternshipItem[];
    title?: string;
    previewLimit?: number;
    onShowAll?: () => void;
    emptyMessage?: string;
}) {
    const [selected, setSelected] = useState<InternshipItem | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    if (internships.length === 0) {
        if (!emptyMessage) return null;
        return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
    }

    const items = previewLimit ? internships.slice(0, previewLimit) : internships;
    const hasMore = previewLimit ? internships.length > previewLimit : false;

    return (
        <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-2">
                    <h2 className="text-base font-bold text-foreground">{title}</h2>
                    <span className="shrink-0 text-xs text-muted-foreground">
                        {internships.length} {internships.length === 1 ? 'vaga' : 'vagas'}
                    </span>
                </div>
                {onShowAll && hasMore && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onShowAll}
                        className="h-auto p-0 text-xs font-semibold text-primary hover:bg-transparent hover:underline"
                    >
                        Ver todas
                        <ArrowRight className="ml-1 size-3" aria-hidden="true" />
                    </Button>
                )}
            </div>

            <div className="flex flex-col gap-2.5">
                {items.map((internship) => (
                    <InternshipCard
                        key={internship.reference}
                        internship={internship}
                        onClick={() => {
                            setSelected(internship);
                            setDetailOpen(true);
                        }}
                    />
                ))}
            </div>

            <InternshipDetailDialog
                summary={selected}
                open={detailOpen}
                onOpenChange={setDetailOpen}
            />
        </section>
    );
}

export function InternshipResults({ text }: { text: string | null }) {
    const query = useQuery(internshipsQueryOptions);

    return (
        <div aria-busy={query.isFetching} className="flex flex-col gap-5">
            <QueryState
                query={query}
                loading="Carregando ofertas de estágio..."
                error="Não foi possível carregar as ofertas de estágio."
                stale="Não foi possível atualizar as vagas. Exibindo os dados salvos."
                className="justify-center"
            >
                {(data) => (
                    <InternshipSection
                        internships={filterInternships(data, text)}
                        title={text ? 'Resultados em Estágios' : 'Mural de Estágios'}
                        emptyMessage={
                            text
                                ? 'Nenhum estágio encontrado para esta busca.'
                                : 'Nenhuma oferta de estágio disponível no momento.'
                        }
                    />
                )}
            </QueryState>
        </div>
    );
}
