import { ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export function SubjectDisclosure({
    count,
    children
}: {
    count: number;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    if (count === 1) return <View className="min-w-0 gap-2">{children}</View>;

    return (
        <View className="min-w-0">
            <Pressable
                accessibilityRole="button"
                aria-expanded={open}
                onPress={() => setOpen(!open)}
                className="flex-row items-center gap-1 self-start py-1"
            >
                <Text className="text-sm font-normal text-muted-foreground">{`${count} matérias`}</Text>
                <Icon
                    as={ChevronDown}
                    className={cn('size-4 text-muted-foreground', open && 'rotate-180')}
                />
            </Pressable>
            {open && (
                <View className="mt-2 min-w-0 gap-2 border-l border-border pl-3">{children}</View>
            )}
        </View>
    );
}
