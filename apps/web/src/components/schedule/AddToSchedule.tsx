import { Plus } from 'lucide-react';
import { m } from 'motion/react';

import type { CatalogSubject, SubjectClassroom } from '#/queries/subjects';

import { usePlannedSchedule } from '#/components/schedule/usePlannedSchedule';
import { Button } from '#/components/ui/button';
import { spring } from '#/lib/motion';
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
                'rounded-lg duration-200 motion-reduce:transition-none',
                !selected && 'bg-primary/15 text-primary hover:bg-primary/25 hover:text-primary'
            )}
            aria-pressed={selected}
            aria-label={`${selected ? 'Remover da' : 'Adicionar à'} grade: ${subject.code}, turma ${classroom.number}`}
            onClick={() => toggle(item)}
        >
            <m.span
                className="flex"
                initial={false}
                animate={{ rotate: selected ? 45 : 0 }}
                transition={spring}
            >
                <Plus aria-hidden="true" />
            </m.span>
        </Button>
    );
}
