import { useQueries } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { X } from 'lucide-react';

import type { AcademicState, CurriculumModel, FlowSubject } from '#/lib/curriculum/model';

import { LoadingText } from '#/components/LoadingText';
import { Button, buttonVariants } from '#/components/ui/button';
import { DialogClose, DialogDescription, DialogTitle } from '#/components/ui/dialog';
import { requirementsText, stateLabels } from '#/lib/curriculum/model';
import { titleCase } from '#/lib/profile';
import { cn } from '#/lib/shadcn';
import { subjectsQueryOptions } from '#/queries/subjects';

export function SubjectDetails({
    subject,
    model,
    state
}: {
    subject: FlowSubject;
    model: CurriculumModel;
    state: AcademicState | null;
}) {
    const relations = [
        ['Pré-requisitos', subject.prerequisites],
        ['Correquisitos', subject.corequisites],
        ['Equivalências', subject.equivalences]
    ] as const;
    const names = new Map(
        [...model.byCode].flatMap(([code, item]) =>
            item.name?.trim() ? [[code, item.name] as const] : []
        )
    );
    const missing = [...new Set(relations.flatMap(([, groups]) => groups?.flat() ?? []))].filter(
        (code) => !names.has(code)
    );
    const queries = useQueries({ queries: missing.map((code) => subjectsQueryOptions({ code })) });
    queries.forEach((query, index) => {
        const item = query.data?.find((candidate) => candidate.code === missing[index]);
        if (item?.name?.trim()) names.set(item.code, item.name);
    });
    const sections = relations.flatMap(([label, groups]) => {
        const text = requirementsText(groups, names);
        return text ? [{ label, text }] : [];
    });
    return (
        <>
            <div className="flex flex-col gap-1">
                <div className="flex items-start gap-2">
                    <DialogTitle className="min-w-0 flex-1">
                        {titleCase(subject.name ?? '')}
                    </DialogTitle>
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
            {queries.some((query) => query.isPending) && (
                <LoadingText>Carregando relações...</LoadingText>
            )}
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
