import type { AcademicState } from '@followw/core/lib/curriculum/types.ts';

import { stateLabels } from '@followw/core/lib/curriculum/model.ts';
import { View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const legendStyles: Record<Exclude<AcademicState, 'unknown'>, { badge: string; text: string }> = {
    completed: { badge: 'bg-success/10', text: 'text-success' },
    enrolled: { badge: 'bg-info/10', text: 'text-info' },
    pending: { badge: 'bg-muted', text: 'text-muted-foreground' },
    overdue: { badge: 'bg-destructive/10', text: 'text-destructive' }
};

export function Legend() {
    return (
        <View
            accessibilityLabel="Legenda dos estados acadêmicos"
            className="flex-row justify-center gap-2"
        >
            {(['completed', 'enrolled', 'pending', 'overdue'] as const).map((state) => (
                <Badge key={state} className={cn('h-5', legendStyles[state].badge)}>
                    <View
                        className={cn('size-1.5 rounded-full bg-current', legendStyles[state].text)}
                    />
                    <Text className={legendStyles[state].text}>{stateLabels[state]}</Text>
                </Badge>
            ))}
        </View>
    );
}
