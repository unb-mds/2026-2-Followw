import { noop, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleHelp } from 'lucide-react';

import type { CatalogSubject } from '#/queries/subjects';

import { ErrorCard } from '#/components/ErrorState';
import { LoadingText } from '#/components/LoadingText';
import { SubjectSummary } from '#/components/search/SubjectSummary';
import { TurmaCard } from '#/components/search/TurmaCard';
import { SectionHeader } from '#/components/SectionHeader';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '#/components/ui/accordion';
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

export function RecommendationCard({
    subject,
    currentPeriod
}: {
    subject: CatalogSubject;
    currentPeriod?: number | null;
}) {
    return (
        <AccordionItem
            value={subject.code}
            className="overflow-hidden rounded-2xl border bg-card text-card-foreground"
        >
            <AccordionTrigger className="items-center gap-3 rounded-none px-3 py-3 hover:bg-primary/5 hover:no-underline focus-visible:ring-inset">
                <SubjectSummary subject={subject} currentPeriod={currentPeriod} />
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
                    <Dialog>
                        <DialogTrigger
                            render={<Button variant="ghost" size="sm" className="self-start" />}
                        >
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
            </AccordionContent>
        </AccordionItem>
    );
}

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

export function RecommendationResults({
    subjects,
    currentPeriod
}: {
    subjects: CatalogSubject[];
    currentPeriod?: number | null;
}) {
    return (
        <>
            {subjects.length === 0 ? (
                <p className="rounded-2xl border bg-card p-4 text-sm">
                    Nenhuma matéria da oferta atual foi recomendada para você.
                </p>
            ) : (
                <Accordion multiple className="gap-2">
                    {subjects.map((subject) => (
                        <RecommendationCard
                            key={subject.code}
                            subject={subject}
                            currentPeriod={currentPeriod}
                        />
                    ))}
                </Accordion>
            )}
        </>
    );
}

export function RecommendationsSection({ currentPeriod }: { currentPeriod?: number | null }) {
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
                    <RecommendationResults subjects={query.data} currentPeriod={currentPeriod} />
                </>
            ) : null}
        </section>
    );
}
