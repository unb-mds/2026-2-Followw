import { noop, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';

import type { CatalogSubject } from '#/queries/subjects';

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
import { reasonLabel, recommendationsQueryOptions } from '#/queries/recommendations';
import { refreshQuery } from '#/queries/refresh';
import { subjectKindLabels } from '#/queries/subjects';

export function RecommendationCard({ subject }: { subject: CatalogSubject }) {
    const reasons = subject.recommendation?.reasons ?? [];
    return (
        <AccordionItem
            value={subject.code}
            className="overflow-hidden rounded-2xl border bg-card text-card-foreground"
        >
            <AccordionTrigger className="items-center gap-3 rounded-none px-3 py-3 hover:bg-primary/5 hover:no-underline focus-visible:ring-inset">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-primary">{subject.code}</span>
                        {subject.kind && (
                            <Badge variant={subject.kind === 'mandatory' ? 'secondary' : 'outline'}>
                                {subjectKindLabels[subject.kind]}
                            </Badge>
                        )}
                    </span>
                    <span className="text-sm leading-snug font-semibold">{subject.name}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                    {`${subject.classrooms.length} ${subject.classrooms.length === 1 ? 'turma' : 'turmas'}`}
                </span>
            </AccordionTrigger>
            <AccordionContent className="pb-0">
                <div className="flex flex-col divide-y divide-border border-t">
                    {subject.classrooms.map((classroom) => (
                        <TurmaCard
                            key={`${classroom.semester}-${classroom.number}`}
                            subject={subject}
                            classroom={classroom}
                            prerequisitesMet={true}
                        />
                    ))}
                </div>
                <div className="flex flex-col gap-3 border-t p-3">
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
                </div>
            </AccordionContent>
        </AccordionItem>
    );
}

export function RecommendationResults({ subjects }: { subjects: CatalogSubject[] }) {
    return (
        <>
            {subjects.length === 0 ? (
                <p className="rounded-2xl border bg-card p-4 text-sm">
                    Nenhuma matéria da oferta atual foi recomendada para você.
                </p>
            ) : (
                <Accordion multiple className="gap-2">
                    {subjects.map((subject) => (
                        <RecommendationCard key={subject.code} subject={subject} />
                    ))}
                </Accordion>
            )}
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
                    <RecommendationResults subjects={query.data} />
                </>
            ) : null}
        </section>
    );
}
