import type { InternshipItem } from '@followw/core/queries/internships.ts';

import { filterInternships, internshipsQueryOptions } from '@followw/core/queries/internships.ts';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';

import { QueryState } from '#/components/QueryState';
import { InternshipCard } from '#/components/search/InternshipCard';
import { InternshipDetailDialog } from '#/components/search/InternshipDetailDialog';
import { Button } from '#/components/ui/button';
import { cn } from '#/lib/shadcn';

const GROUPS = [
    { label: 'Seu curso', mine: true },
    { label: 'Outros cursos', mine: false }
];

function countLabel(count: number) {
    return `${count} ${count === 1 ? 'vaga' : 'vagas'}`;
}

export function InternshipSection({
    internships,
    title,
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
        <section className="flex flex-col gap-4">
            {title && (
                <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-base font-bold text-foreground">{title}</h2>
                        <span className="shrink-0 text-xs text-muted-foreground">
                            {countLabel(internships.length)}
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
            )}

            {GROUPS.map(({ label, mine }) => {
                const visible = items.filter((item) => item.is_my_course === mine);
                if (visible.length === 0) return null;
                const total = internships.filter((item) => item.is_my_course === mine).length;
                const Heading = title ? 'h3' : 'h2';
                return (
                    <div key={label} className="flex flex-col gap-2.5">
                        <div className="flex items-baseline gap-2">
                            <Heading
                                className={cn(
                                    'text-foreground',
                                    title ? 'text-sm font-semibold' : 'text-base font-bold'
                                )}
                            >
                                {label}
                            </Heading>
                            <span className="text-xs text-muted-foreground">
                                {countLabel(total)}
                            </span>
                        </div>
                        {visible.map((internship) => (
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
                );
            })}

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
