import type { TurmaBusca } from '#/queries/search-classrooms';

import { TurmaCard } from '#/components/search/TurmaCard';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '#/components/ui/accordion';

export function TurmaSection({
    title,
    turmas,
    prerequisites
}: {
    title: string;
    turmas: TurmaBusca[];
    prerequisites?: Record<string, boolean | null>;
}) {
    if (turmas.length === 0) return null;

    const subjects = new Map<string, TurmaBusca[]>();
    for (const turma of turmas) {
        const group = subjects.get(turma.subject.code);
        if (group) group.push(turma);
        else subjects.set(turma.subject.code, [turma]);
    }

    return (
        <section className="flex flex-col gap-3">
            <h2 className="text-base font-bold text-foreground">{title}</h2>
            <Accordion multiple className="gap-2">
                {Array.from(subjects, ([code, classrooms]) => (
                    <AccordionItem
                        key={code}
                        value={code}
                        className="overflow-hidden rounded-2xl border bg-card text-card-foreground"
                    >
                        <AccordionTrigger className="items-center gap-3 rounded-none px-3 py-3 hover:bg-primary/5 hover:no-underline focus-visible:ring-inset">
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                                <span className="text-xs font-semibold text-primary">{code}</span>
                                <span className="text-sm leading-snug font-semibold">
                                    {classrooms[0].subject.name}
                                </span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                                {`${classrooms.length} ${classrooms.length === 1 ? 'turma' : 'turmas'}`}
                            </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-0">
                            <div className="flex flex-col divide-y divide-border border-t border-border">
                                {classrooms.map((turma) => (
                                    <TurmaCard
                                        key={turma.id}
                                        turma={turma}
                                        prerequisitesMet={
                                            prerequisites?.[turma.subject.code] ??
                                            turma.prerequisites_met ??
                                            null
                                        }
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
