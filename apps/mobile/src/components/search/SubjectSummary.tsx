import type { CatalogSubject } from '@followw/core/queries/subjects.ts';

import { View } from 'react-native';

import { SubjectKindBadge } from '@/components/search/SubjectKindBadge';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export function SubjectSummary({
    subject,
    currentPeriod = null,
    done = false
}: {
    subject: CatalogSubject;
    currentPeriod?: number | null;
    done?: boolean;
}) {
    // A API só envia período positivo.
    const period = subject.curriculum_period || null;
    const ahead = period != null && currentPeriod != null ? period > currentPeriod : null;
    return (
        <View className="min-w-0 flex-1 gap-1">
            <Text className="text-xs font-semibold text-primary">{subject.code}</Text>
            <Text className="text-sm leading-snug font-semibold">{subject.name}</Text>
            {(subject.kind || period != null) && (
                <View className="flex-row flex-wrap items-center gap-2">
                    <SubjectKindBadge kind={subject.kind} />
                    {period != null && (
                        <Badge
                            variant={
                                done || ahead == null
                                    ? 'outline'
                                    : ahead
                                      ? 'default'
                                      : 'destructive'
                            }
                            className={cn(
                                done && 'border-transparent bg-info/10',
                                !done && ahead && 'bg-primary/10'
                            )}
                        >
                            <Text
                                className={cn(
                                    done && 'text-info',
                                    !done && ahead && 'text-primary'
                                )}
                            >
                                {period}º semestre
                            </Text>
                        </Badge>
                    )}
                </View>
            )}
        </View>
    );
}
