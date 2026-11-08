import type { CatalogSubject } from '@followw/core/queries/subjects.ts';

import { covered } from '@followw/core/queries/subjects.ts';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { SubjectSummary } from '@/components/search/SubjectSummary';
import { TurmaCard } from '@/components/search/TurmaCard';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

const PAGE_SIZE = 25;

export function TurmaSection({
    title,
    subjects,
    taken,
    onOpenDetails,
    currentPeriod,
    footer
}: {
    currentPeriod?: number | null;
    title?: string;
    subjects: CatalogSubject[];
    taken?: Set<string> | null;
    onOpenDetails?: () => void;
    footer?: (subject: CatalogSubject) => ReactNode;
}) {
    const [limit, setLimit] = useState(PAGE_SIZE);
    if (subjects.length === 0) return null;

    return (
        <View className="gap-3">
            {title && (
                <View className="flex-row items-baseline justify-between gap-3">
                    <Text
                        role="heading"
                        aria-level={2}
                        className="text-base font-bold text-foreground"
                    >
                        {title}
                    </Text>
                    <Text className="shrink-0 text-xs text-muted-foreground">
                        {`${subjects.length} ${subjects.length === 1 ? 'resultado' : 'resultados'}`}
                    </Text>
                </View>
            )}
            <Accordion type="multiple">
                <View className="gap-2">
                    {subjects.slice(0, limit).map((subject) => (
                        <AccordionItem
                            key={subject.code}
                            value={subject.code}
                            className="overflow-hidden rounded-2xl border border-border bg-card"
                        >
                            <AccordionTrigger className="items-center gap-3 rounded-none px-3 py-3 active:bg-primary/5">
                                <SubjectSummary
                                    subject={subject}
                                    currentPeriod={currentPeriod}
                                    done={covered(taken, subject)}
                                />
                                <Text className="shrink-0 text-xs font-normal text-muted-foreground">
                                    {`${subject.classrooms.length} ${subject.classrooms.length === 1 ? 'turma' : 'turmas'}`}
                                </Text>
                            </AccordionTrigger>
                            <AccordionContent className="pb-0">
                                <View className="border-t border-border">
                                    {subject.classrooms.map((classroom, index) => (
                                        <View
                                            key={`${classroom.semester}-${classroom.number}`}
                                            className={index > 0 ? 'border-t border-border' : ''}
                                        >
                                            <TurmaCard
                                                subject={subject}
                                                classroom={classroom}
                                                onOpenDetails={onOpenDetails}
                                            />
                                        </View>
                                    ))}
                                </View>
                                {footer?.(subject)}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </View>
            </Accordion>
            {subjects.length > limit && (
                <Button
                    variant="outline"
                    className="self-center"
                    onPress={() => setLimit(limit + PAGE_SIZE)}
                >
                    <Text>Mostrar mais</Text>
                </Button>
            )}
        </View>
    );
}
