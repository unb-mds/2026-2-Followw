import type { CatalogSubject, SubjectClassroom } from '@followw/core/queries/subjects.ts';

import { Plus, X } from 'lucide-react-native';
import { useState } from 'react';

import { usePlannedSchedule } from '@/components/schedule/usePlannedSchedule';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export function AddToSchedule({
    subject,
    classroom
}: {
    subject: CatalogSubject;
    classroom: SubjectClassroom;
}) {
    const { has, toggle } = usePlannedSchedule();
    const [error, setError] = useState<string | null>(null);
    const item = {
        ...classroom,
        code: subject.code,
        name: subject.name,
        hours: subject.hours ?? null
    };
    const selected = has(item);

    return (
        <>
            <Button
                variant={selected ? 'destructive' : 'ghost'}
                size="icon"
                className={cn(
                    'size-9 rounded-lg',
                    !selected && 'bg-primary/15 active:bg-primary/25'
                )}
                aria-selected={selected}
                aria-label={`${selected ? 'Remover da' : 'Adicionar à'} grade: ${subject.code}, turma ${classroom.number}`}
                onPress={() => setError(toggle(item))}
            >
                <Icon
                    as={selected ? X : Plus}
                    className={selected ? 'text-white' : 'text-primary'}
                />
            </Button>
            <AlertDialog open={error !== null} onOpenChange={(open) => !open && setError(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Não foi possível adicionar à grade</AlertDialogTitle>
                        <AlertDialogDescription>{error}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction>
                            <Text>Entendi</Text>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
