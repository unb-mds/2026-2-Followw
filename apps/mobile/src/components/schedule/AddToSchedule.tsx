import type { CatalogSubject, SubjectClassroom } from '@followw/core/queries/subjects.ts';

import { Plus } from 'lucide-react-native';
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { usePlannedSchedule } from '@/components/schedule/usePlannedSchedule';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { spring } from '@/lib/motion';
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
    const rotation = useSharedValue(selected ? 45 : 0);
    useEffect(() => {
        rotation.value = withSpring(selected ? 45 : 0, spring);
    }, [rotation, selected]);
    const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

    return (
        <Button
            variant={selected ? 'destructive' : 'ghost'}
            size="icon"
            className={cn('rounded-lg', !selected && 'bg-primary/15 active:bg-primary/25')}
            accessibilityState={{ selected }}
            accessibilityLabel={`${selected ? 'Remover da' : 'Adicionar à'} grade: ${subject.code}, turma ${classroom.number}`}
            onPress={() => toggle(item)}
        >
            <Animated.View style={turn}>
                <Icon as={Plus} className={selected ? 'text-destructive' : 'text-primary'} />
            </Animated.View>
        </Button>
    );
}
