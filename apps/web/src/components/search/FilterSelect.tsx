import { useId } from 'react';

import { Label } from '#/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '#/components/ui/select';
import { cn } from '#/lib/shadcn';

interface FilterSelectProps {
    label: string;
    icon: React.ReactNode;
    value: string;
    options: readonly string[];
    onChange: (value: string) => void;
    iconOnly?: boolean;
}

export function FilterSelect({
    label,
    icon,
    value,
    options,
    onChange,
    iconOnly = false
}: FilterSelectProps) {
    const id = useId();

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <Label
                htmlFor={id}
                className={cn('text-xs text-muted-foreground', iconOnly && 'sr-only')}
            >
                {label}
            </Label>
            <Select
                disabled={options.length === 0}
                value={value}
                onValueChange={(nextValue) => {
                    if (nextValue) onChange(nextValue);
                }}
            >
                <SelectTrigger
                    id={id}
                    title={iconOnly ? `${label}: ${value}` : undefined}
                    className={cn(
                        'w-full justify-between gap-2 bg-card',
                        iconOnly &&
                            'size-9 justify-center border-0 bg-transparent p-2 hover:bg-muted [&>svg]:hidden',
                        iconOnly && value !== options[0] && 'bg-primary/10 text-primary'
                    )}
                >
                    <span className="flex min-w-0 items-center gap-2">
                        <span className={cn('shrink-0', !iconOnly && 'text-muted-foreground')}>
                            {icon}
                        </span>
                        <span className={cn('truncate text-sm font-medium', iconOnly && 'sr-only')}>
                            <SelectValue placeholder="Nenhum disponível" />
                        </span>
                    </span>
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={option} value={option}>
                            {option}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
