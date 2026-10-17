import { noop, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';

import type { Recommendation, Recommendations } from '#/queries/recommendations';

import { ErrorCard } from '#/components/ErrorState';
import { LoadingText } from '#/components/LoadingText';
import { TurmaCard } from '#/components/search/TurmaCard';
import { SectionHeader } from '#/components/SectionHeader';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '#/components/ui/accordion';
import { Badge } from '#/components/ui/badge';
import { recommendationReasonLabels, recommendationsQueryOptions } from '#/queries/recommendations';
import { refreshQuery } from '#/queries/refresh';
import { subjectsQueryOptions } from '#/queries/subjects';

function RecommendedClassrooms({ item }: { item: Recommendation }) {
    const client = useQueryClient();
    const options = subjectsQueryOptions({
        code: item.subject.code,
        semester: item.classrooms[0]?.semester
    });
    const query = useQuery(options);
    const subject = query.data?.find((candidate) => candidate.code === item.subject.code);
    const refresh = () => void refreshQuery(client, options).catch(noop);

    if (query.isPending) return <LoadingText>Carregando turmas...</LoadingText>;
    if (!subject) {
        return (
            <ErrorCard
                message="Não foi possível carregar as turmas desta matéria."
                onRetry={refresh}
            />
        );
    }

    return (
        <div className="flex flex-col divide-y divide-border border-t">
            {query.isError && (
                <ErrorCard
                    message="Não foi possível atualizar as turmas. Exibindo os dados salvos."
                    onRetry={refresh}
                />
            )}
            {item.classrooms.map((offer) => (
                <TurmaCard
                    key={offer.id}
                    subject={subject}
                    classroom={
                        subject.classrooms.find(
                            (classroom) =>
                                classroom.number === offer.number &&
                                classroom.semester === offer.semester
                        ) ?? { ...offer, professors: offer.professors ?? [] }
                    }
                    prerequisitesMet={true}
                    onOpenDetails={refresh}
                />
            ))}
        </div>
    );
}

export function RecommendationCard({ item }: { item: Recommendation }) {
    return (
        <AccordionItem
            value={item.subject.code}
            className="overflow-hidden rounded-2xl border bg-card text-card-foreground"
        >
            <AccordionTrigger className="items-center gap-3 rounded-none px-3 py-3 hover:bg-primary/5 hover:no-underline focus-visible:ring-inset">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-xs font-semibold text-primary">{item.subject.code}</span>
                    <span className="text-sm leading-snug font-semibold">{item.subject.name}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                    {`${item.classrooms.length} ${item.classrooms.length === 1 ? 'turma' : 'turmas'}`}
                </span>
            </AccordionTrigger>
            <AccordionContent className="pb-0">
                <RecommendedClassrooms item={item} />
                <div className="flex flex-col gap-3 border-t p-3">
                    <ul aria-label="Critérios atendidos" className="flex flex-col gap-2 text-sm">
                        {item.reasons
                            .toSorted((a, b) => b.points - a.points)
                            .map((reason) => (
                                <li key={reason.code} className="flex items-center gap-2">
                                    <Badge className="size-5 rounded-full bg-primary/10 p-0 text-primary">
                                        <Check aria-hidden="true" />
                                    </Badge>
                                    <span>{recommendationReasonLabels[reason.code]}</span>
                                </li>
                            ))}
                        {item.reasons.length === 0 && (
                            <li>Atende aos critérios para cursar, sem bônus de prioridade.</li>
                        )}
                    </ul>
                    {item.equivalent_to.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                            Equivalência a:{' '}
                            {item.equivalent_to
                                .map((subject) => `${subject.code} — ${subject.name}`)
                                .join('; ')}
                            .
                        </p>
                    )}
                </div>
            </AccordionContent>
        </AccordionItem>
    );
}

export function RecommendationResults({ data }: { data: Recommendations }) {
    return (
        <>
            {data.items.length === 0 ? (
                <p className="rounded-2xl border bg-card p-4 text-sm">
                    {data.diagnostics.context_state === 'offer_unavailable'
                        ? 'Ainda não há uma oferta disponível para recomendar matérias.'
                        : !data.context.curriculum
                          ? 'Não foi possível identificar sua matriz curricular para recomendar matérias.'
                          : 'Nenhuma matéria elegível foi encontrada na oferta disponível.'}
                </p>
            ) : (
                <Accordion multiple className="gap-2">
                    {data.items.map((item) => (
                        <RecommendationCard key={item.subject.code} item={item} />
                    ))}
                </Accordion>
            )}
            <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Sobre estas recomendações</summary>
                <p className="mt-2">
                    As sugestões consideram sua matriz, histórico e pré-requisitos. A ordem prioriza
                    obrigatórias, avanço no fluxo e matérias que liberam outras.
                </p>
            </details>
        </>
    );
}

export function RecommendationsSection() {
    const client = useQueryClient();
    const query = useQuery(recommendationsQueryOptions);
    const refresh = () => void refreshQuery(client, recommendationsQueryOptions).catch(noop);
    return (
        <section
            aria-label="Matérias recomendadas"
            className="flex flex-col gap-3"
            aria-busy={query.isFetching}
        >
            <SectionHeader title="Matérias recomendadas" className="mb-0" />
            {query.isPending ? (
                <LoadingText>Buscando recomendações...</LoadingText>
            ) : query.isLoadingError ? (
                <ErrorCard
                    message="Não foi possível carregar suas recomendações."
                    onRetry={refresh}
                />
            ) : query.data ? (
                <>
                    {query.isError && (
                        <ErrorCard
                            message="Não foi possível atualizar suas recomendações. Exibindo a última consulta."
                            onRetry={refresh}
                        />
                    )}
                    <RecommendationResults data={query.data} />
                </>
            ) : null}
        </section>
    );
}
