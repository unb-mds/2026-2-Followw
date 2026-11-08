import type { CatalogSubject } from '@followw/core/queries/subjects.ts';

import { covered } from '@followw/core/queries/subjects.ts';
import { ChevronDown } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { SubjectSummary } from '@/components/search/SubjectSummary';
import { TurmaCard } from '@/components/search/TurmaCard';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

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
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    if (subjects.length === 0) return null;
    const toggle = (code: string) =>
        setExpanded((previous) => {
            const next = new Set(previous);
            if (!next.delete(code)) next.add(code);
            return next;
        });

    return (
        <View className="gap-3">
            {title && (
                <View className="flex-row items-baseline justify-between gap-3">
                    <Text role="heading" aria-level={2} className="text-base font-bold">
                        {title}
                    </Text>
                    <Text className="shrink-0 text-xs text-muted-foreground">
                        {`${subjects.length} ${subjects.length === 1 ? 'resultado' : 'resultados'}`}
                    </Text>
                </View>
            )}
            <View className="gap-2">
                {subjects.slice(0, limit).map((subject) => {
                    const open = expanded.has(subject.code);
                    return (
                        <View
                            key={subject.code}
                            className="overflow-hidden rounded-2xl border border-border bg-card"
                        >
                            <Pressable
                                accessibilityRole="button"
                                aria-expanded={open}
                                onPress={() => toggle(subject.code)}
                                className="flex-row items-center gap-3 p-3 active:bg-primary/5"
                            >
                                <SubjectSummary
                                    subject={subject}
                                    currentPeriod={currentPeriod}
                                    done={covered(taken, subject)}
                                />
                                <Text className="shrink-0 text-xs text-muted-foreground">
                                    {`${subject.classrooms.length} ${subject.classrooms.length === 1 ? 'turma' : 'turmas'}`}
                                </Text>
                                <Icon
                                    as={ChevronDown}
                                    className={cn(
                                        'size-4 text-muted-foreground',
                                        open && 'rotate-180'
                                    )}
                                />
                            </Pressable>
                            {open && (
                                <View>
                                    {subject.classrooms.map((classroom) => (
                                        <View
                                            key={`${classroom.semester}-${classroom.number}`}
                                            className="border-t border-border"
                                        >
                                            <TurmaCard
                                                subject={subject}
                                                classroom={classroom}
                                                onOpenDetails={onOpenDetails}
                                            />
                                        </View>
                                    ))}
                                    {footer?.(subject)}
                                </View>
                            )}
                        </View>
                    );
                })}
            </View>
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
