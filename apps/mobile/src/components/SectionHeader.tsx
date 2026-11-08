import { type Href, Link } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
    title: string;
    actionLabel?: string;
    actionHref?: Href;
    className?: string;
}

export function SectionHeader({ title, actionLabel, actionHref, className }: SectionHeaderProps) {
    return (
        <View className={cn('flex-row items-center justify-between', className)}>
            <Text role="heading" aria-level={2} className="text-xl font-bold tracking-tight">
                {title}
            </Text>
            {actionLabel && actionHref && (
                <Link href={actionHref} asChild>
                    <Button variant="link" size="sm">
                        <Text>{actionLabel}</Text>
                    </Button>
                </Link>
            )}
        </View>
    );
}
