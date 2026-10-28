import { noop, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleHelp } from 'lucide-react';

import type { CatalogSubject, Tipo } from '#/queries/subjects';

import { ErrorCard } from '#/components/ErrorState';
import { LoadingText } from '#/components/LoadingText';
import { TurmaSection } from '#/components/search/TurmaSection';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '#/components/ui/dialog';
import { reasonLabel, recommendationsQueryOptions } from '#/queries/recommendations';
import { refreshQuery } from '#/queries/refresh';
import { filterSubjects } from '#/queries/subjects';

export function RecommendationReasons({ subject }: { subject: CatalogSubject }) {
    const reasons = subject.recommendation?.reasons ?? [];
    return (
        <ul aria-label="Critérios atendidos" className="flex flex-col gap-2 text-sm">
            {reasons.map((reason) => (
                <li key={reason.code} className="flex items-center gap-2">
                    <Badge className="size-5 rounded-full bg-primary/10 p-0 text-primary">
                        <Check aria-hidden="true" />
                    </Badge>
                    <span>{reasonLabel(reason)}</span>
                </li>
            ))}
            {reasons.length === 0 && (
                <li>Atende aos critérios para cursar, sem bônus de prioridade.</li>
            )}
        </ul>
    );
}

function WhyDialog(subject: CatalogSubject) {
    return (
        <div className="flex flex-col gap-3 border-t p-3">
            <Dialog>
                <DialogTrigger render={<Button variant="ghost" size="sm" className="self-start" />}>
                    <CircleHelp aria-hidden="true" />
                    Por que esta matéria?
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Por que esta matéria?</DialogTitle>
                        <DialogDescription>{subject.name}</DialogDescription>
                    </DialogHeader>
                    <RecommendationReasons subject={subject} />
                </DialogContent>
            </Dialog>
        </div>
    );
}

const DEFAULT_FILTERS = { tipo: 'Todas', busca: '' } as const;

export function RecommendationsSection({
    currentPeriod,
    approved,
    taken,
    filters = DEFAULT_FILTERS
}: {
    currentPeriod?: number | null;
    approved?: Set<string> | null;
    taken?: Set<string> | null;
    filters?: { tipo: Tipo; busca: string };
}) {
    const client = useQueryClient();
    const query = useQuery(recommendationsQueryOptions);
    const refresh = () => void refreshQuery(client, recommendationsQueryOptions).catch(noop);
    const subjects = query.data && filterSubjects(query.data, filters);
    const title =
        filters.tipo === 'Todas' ? 'Matérias recomendadas' : `${filters.tipo} disponíveis`;
    return (
        <section aria-label={title} className="flex flex-col gap-3" aria-busy={query.isFetching}>
            {query.isPending ? (
                <LoadingText>Buscando recomendações...</LoadingText>
            ) : query.isLoadingError ? (
                <ErrorCard
                    message="Não foi possível carregar suas recomendações."
                    onRetry={refresh}
                />
            ) : subjects ? (
                <>
                    {query.isError && (
                        <ErrorCard
                            message="Não foi possível atualizar suas recomendações. Exibindo a última consulta."
                            onRetry={refresh}
                        />
                    )}
                    {subjects.length === 0 ? (
                        <p className="rounded-2xl border bg-card p-4 text-sm">
                            {filters.tipo === 'Todas'
                                ? 'Nenhuma matéria da oferta atual foi recomendada para você.'
                                : 'Nenhuma matéria disponível para você com essa busca e filtros.'}
                        </p>
                    ) : (
                        <TurmaSection
                            key={JSON.stringify(filters)}
                            subjects={subjects}
                            currentPeriod={currentPeriod}
                            approved={approved}
                            taken={taken}
                            footer={WhyDialog}
                        />
                    )}
                </>
            ) : null}
        </section>
    );
}
