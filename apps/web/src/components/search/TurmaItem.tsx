import type { CatalogSubject } from '@followw/core/queries/subjects.ts';
import type { ReactElement, ReactNode } from 'react';

import { covered } from '@followw/core/queries/subjects.ts';

import { SubjectSummary } from '#/components/search/SubjectSummary';
import { TurmaCard } from '#/components/search/TurmaCard';
import { AccordionContent, AccordionItem, AccordionTrigger } from '#/components/ui/accordion';

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
    footer
}: TurmaItemProps) {
    const count = subject.classrooms.length;
    return (
        <AccordionItem
            render={animation}
            value={subject.code}
            className="overflow-hidden rounded-2xl border bg-card text-card-foreground"
        >
            <AccordionTrigger className="items-center gap-3 rounded-none px-3 py-3 hover:bg-primary/5 hover:no-underline focus-visible:ring-inset lg:px-5 lg:py-4">
                <SubjectSummary
                    subject={subject}
                    currentPeriod={currentPeriod}
                    done={covered(taken, subject)}
                />
                <span className="shrink-0 text-xs text-muted-foreground">
                    {`${count} ${count === 1 ? 'turma' : 'turmas'}`}
                </span>
            </AccordionTrigger>
            <AccordionContent className="pb-0">
                <div className="flex flex-col divide-y divide-border border-t border-border">
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
