import type { CatalogSubject, SubjectClassroom } from '@followw/core/queries/subjects.ts';

import { titleCase } from '@followw/core/lib/profile.ts';
import { describeSchedule } from '@followw/core/lib/schedule.ts';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { AddToSchedule } from '@/components/schedule/AddToSchedule';
import { Seats } from '@/components/search/Seats';
import { SearchLinkContext } from '@/components/search/SubjectSearchLink';
import { TurmaDetails } from '@/components/search/TurmaDetails';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
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
    const { width, height } = useWindowDimensions();
    const professors = classroom.professors.map(({ name }) => titleCase(name)).join(', ');
    const close = useCallback(() => setOpen(false), []);
    const change = (value: boolean) => {
        setOpen(value);
        if (value) onOpenDetails?.();
    };

    return (
        <>
            <View className="flex-row items-center gap-3">
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Detalhes da turma ${classroom.number}`}
                    onPress={() => change(true)}
                    className="min-w-0 flex-1 flex-row items-center gap-3 py-2.5 pl-3 active:bg-primary/5"
                >
                    <View className="min-w-0 flex-1 gap-0.5">
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
                                professors ? 'font-semibold' : 'text-muted-foreground'
                            )}
                        >
                            {professors || 'Docentes não informados'}
                        </Text>
                    </View>
                    <Seats classroom={classroom} />
                </Pressable>
                <View className="pr-3">
                    <AddToSchedule subject={subject} classroom={classroom} />
                </View>
            </View>
            <Dialog open={open} onOpenChange={change}>
                <DialogContent
                    className="max-w-lg p-4"
                    style={{ width: Math.min(width - 16, 512) }}
                >
                    <DialogHeader className="pr-6">
                        <DialogDescription className="text-left text-xs">
                            {subject.code} · Turma {classroom.number} · {classroom.semester}
                        </DialogDescription>
                        <DialogTitle className="text-left text-lg leading-snug">
                            {subject.name}
                        </DialogTitle>
                    </DialogHeader>
                    <ScrollView style={{ maxHeight: height * 0.7 }}>
                        <SearchLinkContext.Provider value={close}>
                            <TurmaDetails subject={subject} classroom={classroom} />
                        </SearchLinkContext.Provider>
                    </ScrollView>
                </DialogContent>
            </Dialog>
        </>
    );
}
