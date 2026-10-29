import { Plus, X } from 'lucide-react';

import type { CatalogSubject, SubjectClassroom } from '#/queries/subjects';

import { usePlannedSchedule } from '#/components/schedule/usePlannedSchedule';
import { Button } from '#/components/ui/button';
import { cn } from '#/lib/shadcn';

export function AddToSchedule({
    subject,
    classroom
}: {
    subject: CatalogSubject;
    classroom: SubjectClassroom;
}) {
    const { has, toggle } = usePlannedSchedule();
    const item = {
        ...classroom,
        code: subject.code,
        name: subject.name,
        hours: subject.hours ?? null
    };
    const selected = has(item);

    return (
        <Button
            variant={selected ? 'destructive' : 'ghost'}
            size="icon"
            className={cn(
                'rounded-lg',
                !selected && 'bg-primary/15 text-primary hover:bg-primary/25 hover:text-primary'
            )}
            aria-pressed={selected}
            aria-label={`${selected ? 'Remover da' : 'Adicionar à'} grade: ${subject.code}, turma ${classroom.number}`}
            onClick={() => toggle(item)}
        >
            {selected ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
        </Button>
    );
}
