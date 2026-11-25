import type { CatalogSubject } from '@followw/core/queries/subjects.ts';

import { covered } from '@followw/core/queries/subjects.ts';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { repeat, SectionHeaderSkeleton } from '@/components/LoadingSkeleton';
import { SubjectSummary } from '@/components/search/SubjectSummary';
import { TurmaCard } from '@/components/search/TurmaCard';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { Rise } from '@/lib/motion';

const PAGE_SIZE = 25;

export function TurmaSection({
    title,
    summary,
    subjects,
    taken,
    onOpenDetails,
    currentPeriod,
    footer,
    clientPagination = false
}: {
    currentPeriod?: number | null;
    title?: string;
    // texto ao lado do título; por padrão, a quantidade exibida
    summary?: string;
    subjects: CatalogSubject[];
    taken?: Set<string> | null;
    onOpenDetails?: (subject: CatalogSubject) => void;
    footer?: (subject: CatalogSubject) => ReactNode;
    clientPagination?: boolean;
}) {
    const [limit, setLimit] = useState(PAGE_SIZE);
    const shown = clientPagination ? subjects.slice(0, limit) : subjects;

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
                        {summary ??
                            `${subjects.length} ${subjects.length === 1 ? 'resultado' : 'resultados'}`}
                    </Text>
                </View>
            )}
            {subjects.length > 0 && (
                <Accordion type="multiple">
                    <View className="gap-2">
                        {shown.map((subject, index) => (
                            <Rise key={subject.code} index={index % PAGE_SIZE}>
                                <AccordionItem
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
                                            {subject.classrooms.map((classroom, position) => (
                                                <View
                                                    key={`${classroom.semester}-${classroom.number}`}
                                                    className={
                                                        position > 0 ? 'border-t border-border' : ''
                                                    }
                                                >
                                                    <TurmaCard
                                                        subject={subject}
                                                        classroom={classroom}
                                                        onOpenDetails={
                                                            onOpenDetails &&
                                                            (() => onOpenDetails(subject))
                                                        }
                                                    />
                                                </View>
                                            ))}
                                        </View>
                                        {footer?.(subject)}
                                    </AccordionContent>
                                </AccordionItem>
                            </Rise>
                        ))}
                    </View>
                </Accordion>
            )}
            {clientPagination && subjects.length > limit && (
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

export function TurmaSectionSkeleton({ title = false }: { title?: boolean }) {
    return (
        <View className="flex-col gap-3">
            {title && <SectionHeaderSkeleton />}
            <View className="flex-col gap-2">
                {repeat(5, () => (
                    <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3">
                        <View className="min-w-0 flex-1 flex-col gap-1.5">
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-4 w-3/4" />
                        </View>
                        <Skeleton className="h-3 w-12 shrink-0" />
                    </View>
                ))}
            </View>
        </View>
    );
}
