import { ScrollView } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface TabFilterProps<T extends string> {
    label: string;
    value: T | undefined;
    options: readonly T[];
    labels?: Partial<Record<T, string>>;
    onChange: (value: T) => void;
    className?: string;
}

/** Seletor horizontal de uma opção (abas de filtro, tema...). */
export function TabFilter<T extends string>({
    label,
    value,
    options,
    labels,
    onChange,
    className
}: TabFilterProps<T>) {
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityLabel={label}
            className={cn('grow-0', className)}
            contentContainerClassName="items-center gap-1 py-1"
        >
            {options.map((option) => (
                <Button
                    key={option}
                    variant={option === value ? 'secondary' : 'ghost'}
                    aria-selected={option === value}
                    onPress={() => onChange(option)}
                >
                    <Text>{labels?.[option] ?? option}</Text>
                </Button>
            ))}
        </ScrollView>
    );
}
