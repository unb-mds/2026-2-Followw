import { ScrollView } from 'react-native';

import { Highlight, useSlidingHighlight } from '@/components/SlidingHighlight';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface TabFilterProps<T extends string> {
    label: string;
    value: T | undefined;
    options: readonly T[];
    labels?: Partial<Record<T, string>>;
    onChange: (value: T) => void;
    size?: 'default' | 'sm';
    className?: string;
}

/** Seletor horizontal de uma opção (abas de filtro, tema...). */
export function TabFilter<T extends string>({
    label,
    value,
    options,
    labels,
    onChange,
    size,
    className
}: TabFilterProps<T>) {
    const highlight = useSlidingHighlight(value);
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityLabel={label}
            className={cn('min-w-0 grow-0', className)}
            contentContainerClassName="flex-row items-center gap-1 py-1"
        >
            <Highlight
                highlight={highlight}
                top={4}
                className={cn(size === 'sm' ? 'rounded-md' : 'rounded-lg', 'bg-secondary')}
            />
            {options.map((option) => (
                <Button
                    key={option}
                    variant="ghost"
                    size={size}
                    accessibilityState={{ selected: option === value }}
                    onPress={() => onChange(option)}
                    onLayout={highlight.measure(option)}
                    className={cn('shrink-0', option === value && 'active:bg-transparent')}
                >
                    <Text className={cn(option === value && 'text-secondary-foreground')}>
                        {labels?.[option] ?? option}
                    </Text>
                </Button>
            ))}
        </ScrollView>
    );
}
