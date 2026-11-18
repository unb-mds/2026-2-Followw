import type { PlannedClass } from '@followw/core/lib/planned-schedule.ts';
import type { CatalogSubject } from '@followw/core/queries/subjects.ts';

import { reasonLabel, recommendationsQueryOptions } from '@followw/core/queries/recommendations.ts';
import { withClassrooms } from '@followw/core/queries/subjects.ts';
import { noop, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleHelp } from 'lucide-react';

import { ErrorCard } from '#/components/ErrorState';
import { LoadingSkeleton } from '#/components/LoadingSkeleton';
import { TurmaSection, TurmaSectionSkeleton } from '#/components/search/TurmaSection';
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
import { refreshQuery } from '#/queries/refresh';

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

export function RecommendationsSection({
    currentPeriod,
    planned,
    taken
}: {
    currentPeriod?: number | null;
    planned?: readonly PlannedClass[];
    taken?: Set<string> | null;
}) {
    const client = useQueryClient();
    const query = useQuery(recommendationsQueryOptions);
    const refresh = () => void refreshQuery(client, recommendationsQueryOptions).catch(noop);
    const subjects = query.data && withClassrooms(query.data, taken, planned);
    return (
        <section
            aria-label="Matérias recomendadas"
            className="flex flex-col gap-3"
            aria-busy={query.isFetching}
        >
            {query.isPending ? (
                <LoadingSkeleton label="Buscando recomendações...">
                    <TurmaSectionSkeleton />
                </LoadingSkeleton>
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
                            Nenhuma matéria da oferta atual foi recomendada para você.
                        </p>
                    ) : (
                        <TurmaSection
                            subjects={subjects}
                            currentPeriod={currentPeriod}
                            taken={taken}
                            footer={WhyDialog}
                        />
                    )}
                </>
            ) : null}
        </section>
    );
}
