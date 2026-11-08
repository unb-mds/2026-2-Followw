import type { CatalogSubject, SubjectClassroom } from '@followw/core/queries/subjects.ts';

import { titleCase } from '@followw/core/lib/profile.ts';
import { describeSchedule } from '@followw/core/lib/schedule.ts';
import { X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { AddToSchedule } from '@/components/schedule/AddToSchedule';
import { Seats } from '@/components/search/Seats';
import { SearchLinkContext } from '@/components/search/SubjectSearchLink';
import { TurmaDetails } from '@/components/search/TurmaDetails';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export interface TurmaProps {
    subject: CatalogSubject;
    classroom: SubjectClassroom;
}

export function TurmaCard({
    subject,
    classroom,
    onOpenDetails
}: TurmaProps & { onOpenDetails?: () => void }) {
    const [open, setOpen] = useState(false);
    const { height } = useWindowDimensions();
    const professors = classroom.professors.map(({ name }) => titleCase(name)).join(', ');
    const close = useCallback(() => setOpen(false), []);
    const change = (value: boolean) => {
        setOpen(value);
        if (value) onOpenDetails?.();
    };

    return (
        <Dialog open={open} onOpenChange={change}>
            <View className="flex-row items-center gap-3 px-3 py-2.5">
                <DialogTrigger asChild>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Detalhes da turma ${classroom.number}`}
                        className="absolute inset-0 active:bg-primary/5"
                    />
                </DialogTrigger>
                <View pointerEvents="none" className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-xs text-muted-foreground">
                        <Text className="text-xs font-semibold text-primary">
                            {describeSchedule(classroom.schedule) ?? 'Horário a definir'}
                        </Text>
                        {` · ${classroom.room ?? 'Local não informado'} · T${classroom.number}`}
                    </Text>
                    <Text
                        numberOfLines={2}
                        className={cn(
                            'text-sm leading-snug',
                            professors ? 'font-semibold text-foreground' : 'text-muted-foreground'
                        )}
                    >
                        {professors || 'Docentes não informados'}
                    </Text>
                </View>
                <View pointerEvents="none">
                    <Seats classroom={classroom} />
                </View>
                <View className="shrink-0">
                    <AddToSchedule subject={subject} classroom={classroom} />
                </View>
            </View>
            <DialogContent className="max-w-lg rounded-2xl" showCloseButton={false}>
                <ScrollView
                    style={{ maxHeight: height * 0.8 }}
                    className="w-full"
                    contentContainerClassName="gap-4"
                >
                    <View className="flex-row items-start gap-3">
                        <DialogHeader className="min-w-0 flex-1">
                            <DialogDescription className="text-left text-xs">
                                {subject.code} · Turma {classroom.number} · {classroom.semester}
                            </DialogDescription>
                            <DialogTitle className="text-left text-lg leading-snug font-semibold">
                                {subject.name}
                            </DialogTitle>
                        </DialogHeader>
                        <DialogClose asChild>
                            <Button
                                variant="ghost"
                                size="icon-lg"
                                accessibilityLabel="Fechar detalhes da turma"
                            >
                                <Icon as={X} className="size-5" />
                            </Button>
                        </DialogClose>
                    </View>
                    <SearchLinkContext.Provider value={close}>
                        <TurmaDetails subject={subject} classroom={classroom} />
                    </SearchLinkContext.Provider>
                </ScrollView>
            </DialogContent>
        </Dialog>
    );
}
