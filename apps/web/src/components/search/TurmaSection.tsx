import type { CatalogSubject } from '#/queries/subjects';

import { SubjectSummary } from '#/components/search/SubjectSummary';
import { TurmaCard } from '#/components/search/TurmaCard';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '#/components/ui/accordion';
import { prerequisitesMet } from '#/queries/subjects';

export function TurmaSection({
    title,
    subjects,
    total = subjects.length,
    approved,
    taken,
    onOpenDetails,
    currentPeriod
}: {
    currentPeriod?: number | null;
    title: string;
    subjects: CatalogSubject[];
    total?: number;
    approved: Set<string> | null;
    taken?: Set<string> | null;
    onOpenDetails?: () => void;
}) {
    if (subjects.length === 0) return null;

    return (
        <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-bold text-foreground">{title}</h2>
                <span className="shrink-0 text-xs text-muted-foreground">
                    {`${total} ${total === 1 ? 'resultado' : 'resultados'}`}
                </span>
            </div>
            <Accordion multiple className="gap-2">
                {subjects.map((subject) => (
                    <AccordionItem
                        key={subject.code}
                        value={subject.code}
                        className="overflow-hidden rounded-2xl border bg-card text-card-foreground"
                    >
                        <AccordionTrigger className="items-center gap-3 rounded-none px-3 py-3 hover:bg-primary/5 hover:no-underline focus-visible:ring-inset">
                            <SubjectSummary
                                subject={subject}
                                currentPeriod={currentPeriod}
                                done={taken?.has(subject.code) ?? false}
                            />
                            <span className="shrink-0 text-xs text-muted-foreground">
                                {`${subject.classrooms.length} ${subject.classrooms.length === 1 ? 'turma' : 'turmas'}`}
                            </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-0">
                            <div className="flex flex-col divide-y divide-border border-t border-border">
                                {subject.classrooms.map((classroom) => (
                                    <TurmaCard
                                        key={classroom.number}
                                        subject={subject}
                                        classroom={classroom}
                                        onOpenDetails={onOpenDetails}
                                        prerequisitesMet={prerequisitesMet(
                                            subject.prerequisites,
                                            approved
                                        )}
                                    />
                                ))}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </section>
    );
}
