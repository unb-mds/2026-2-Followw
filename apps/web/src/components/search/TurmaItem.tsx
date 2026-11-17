import type { CatalogSubject } from '@followw/core/queries/subjects.ts';
import type { ReactElement, ReactNode } from 'react';

import { titleCase } from '@followw/core/lib/profile.ts';
import { covered, subjectsQueryOptions } from '@followw/core/queries/subjects.ts';
import { noop, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { QueryState } from '#/components/QueryState';
import { SubjectSummary } from '#/components/search/SubjectSummary';
import { TurmaCard } from '#/components/search/TurmaCard';
import { AccordionContent, AccordionItem, AccordionTrigger } from '#/components/ui/accordion';
import { refreshQuery } from '#/queries/refresh';

type TurmaItemProps = {
    subject: CatalogSubject;
    animation: ReactElement;
    currentPeriod?: number | null;
    taken?: Set<string> | null;
    onOpenDetails?: () => void;
    footer?: ReactNode;
};

export function TurmaItem({
    subject,
    animation,
    currentPeriod,
    taken,
    onOpenDetails,
    footer,
    onOpenChange,
    count = subject.classrooms.length,
    status
}: TurmaItemProps & {
    onOpenChange?: (open: boolean) => void;
    count?: number | null;
    status?: ReactNode;
}) {
    return (
        <AccordionItem
            render={animation}
            value={subject.code}
            onOpenChange={onOpenChange}
            className="overflow-hidden rounded-2xl border bg-card text-card-foreground"
        >
            <AccordionTrigger className="items-center gap-3 rounded-none px-3 py-3 hover:bg-primary/5 hover:no-underline focus-visible:ring-inset lg:px-5 lg:py-4">
                <SubjectSummary
                    subject={subject}
                    currentPeriod={currentPeriod}
                    done={covered(taken, subject)}
                />
                <span className="shrink-0 text-xs text-muted-foreground">
                    {count === null ? 'Ver turmas' : `${count} ${count === 1 ? 'turma' : 'turmas'}`}
                </span>
            </AccordionTrigger>
            <AccordionContent className="pb-0">
                <div className="flex flex-col divide-y divide-border border-t border-border">
                    {status}
                    {subject.classrooms.map((classroom) => (
                        <TurmaCard
                            key={`${classroom.semester}-${classroom.number}`}
                            subject={subject}
                            classroom={classroom}
                            onOpenDetails={onOpenDetails}
                        />
                    ))}
                </div>
                {footer}
            </AccordionContent>
        </AccordionItem>
    );
}

export function LazyTurmaItem({ subject, ...props }: TurmaItemProps) {
    const [open, setOpen] = useState(false);
    const client = useQueryClient();
    const options = subjectsQueryOptions({ code: subject.code });
    const query = useQuery({ ...options, enabled: open });
    const catalog = query.data?.find(({ code }) => code === subject.code);
    const count = query.data ? (catalog?.classrooms.length ?? 0) : null;
    const details = catalog
        ? { ...catalog, name: titleCase(catalog.name), kind: subject.kind, curriculum_period: null }
        : subject;

    return (
        <TurmaItem
            {...props}
            subject={details}
            onOpenChange={setOpen}
            count={count}
            onOpenDetails={() => void refreshQuery(client, options).catch(noop)}
            status={
                count === 0 || query.isError || query.isPending ? (
                    <div className="px-3 py-2.5">
                        <QueryState
                            query={query}
                            loading="Carregando turmas..."
                            error="Não foi possível carregar as turmas."
                            stale="Não foi possível atualizar as turmas. Exibindo os dados salvos."
                        >
                            {() =>
                                count === 0 && (
                                    <p className="text-sm text-muted-foreground">
                                        Nenhuma turma disponível.
                                    </p>
                                )
                            }
                        </QueryState>
                    </div>
                ) : null
            }
        />
    );
}
