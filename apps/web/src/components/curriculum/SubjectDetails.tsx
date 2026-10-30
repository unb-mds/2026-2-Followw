import { Link } from '@tanstack/react-router';
import { X } from 'lucide-react';

import type { AcademicState, FlowSubject } from '#/lib/curriculum/types';

import { Button, buttonVariants } from '#/components/ui/button';
import { DialogClose, DialogDescription, DialogTitle } from '#/components/ui/dialog';
import { requirementsText, subjectsText } from '#/lib/curriculum/format';
import { stateLabels } from '#/lib/curriculum/model';
import { titleCase } from '#/lib/profile';
import { cn } from '#/lib/shadcn';

export function SubjectDetails({
    subject,
    state,
    unlocks
}: {
    subject: FlowSubject;
    state?: AcademicState;
    unlocks?: FlowSubject[];
}) {
    const sections = [
        { label: 'Pré-requisitos', text: requirementsText(subject.prerequisites) },
        { label: 'Correquisitos', text: requirementsText(subject.corequisites) },
        { label: 'Equivalências', text: requirementsText(subject.equivalences) },
        { label: 'Desbloqueia', text: subjectsText(unlocks) }
    ].filter((section) => section.text);
    return (
        <>
            <div className="flex flex-col gap-1">
                <div className="flex items-start gap-2">
                    <DialogTitle className="min-w-0 flex-1">{titleCase(subject.name)}</DialogTitle>
                    <DialogClose
                        render={
                            <Button variant="ghost" size="icon-sm" className="-mt-1 shrink-0" />
                        }
                        aria-label="Fechar detalhes da matéria"
                    >
                        <X className="size-4" aria-hidden="true" />
                    </DialogClose>
                </div>
                <DialogDescription>
                    {state && <>{stateLabels[state]} · </>}
                    {subject.period}º semestre
                </DialogDescription>
            </div>
            {sections.length > 0 && (
                <dl className="flex flex-col gap-4 text-sm">
                    {sections.map(({ label, text }) => (
                        <div key={label}>
                            <dt className="mb-1 font-bold">{label}</dt>
                            <dd className="text-muted-foreground">{text}</dd>
                        </div>
                    ))}
                </dl>
            )}
            <Link
                to="/buscar"
                search={{ q: subject.code, category: 'classrooms' }}
                className={cn(buttonVariants(), 'w-full')}
            >
                Visualizar turmas
            </Link>
        </>
    );
}
