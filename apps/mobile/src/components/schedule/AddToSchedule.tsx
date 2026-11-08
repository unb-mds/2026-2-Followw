import type { CatalogSubject, SubjectClassroom } from '@followw/core/queries/subjects.ts';

import { Plus, X } from 'lucide-react-native';

import { usePlannedSchedule } from '@/components/schedule/usePlannedSchedule';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

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
            className={cn('rounded-lg', !selected && 'bg-primary/15 active:bg-primary/25')}
            accessibilityState={{ selected }}
            accessibilityLabel={`${selected ? 'Remover da' : 'Adicionar à'} grade: ${subject.code}, turma ${classroom.number}`}
            onPress={() => toggle(item)}
        >
            <Icon
                as={selected ? X : Plus}
                className={selected ? 'text-destructive' : 'text-primary'}
            />
        </Button>
    );
}
