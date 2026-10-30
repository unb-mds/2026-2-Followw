import { Button } from '#/components/ui/button';
import { cn } from '#/lib/shadcn';

interface TabFilterProps<T extends string> {
    label: string;
    value: T | undefined;
    options: readonly T[];
    labels?: Partial<Record<T, string>>;
    onChange: (value: T) => void;
    className?: string;
}

export function TabFilter<T extends string>({
    label,
    value,
    options,
    labels,
    onChange,
    className
}: TabFilterProps<T>) {
    return (
        <fieldset
            className={cn(
                'flex items-center gap-1 overflow-x-auto py-1 max-md:no-scrollbar',
                className
            )}
            aria-label={label}
        >
            {options.map((option) => (
                <Button
                    key={option}
                    variant={option === value ? 'secondary' : 'ghost'}
                    aria-pressed={option === value}
                    onClick={() => onChange(option)}
                    className="shrink-0"
                >
                    {labels?.[option] ?? option}
                </Button>
            ))}
        </fieldset>
    );
}
