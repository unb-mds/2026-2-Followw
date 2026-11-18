import { m } from 'motion/react';
import { useId } from 'react';

import { Button } from '#/components/ui/button';
import { spring } from '#/lib/motion';
import { cn } from '#/lib/shadcn';

interface TabFilterProps<T extends string> {
    label: string;
    value: T | undefined;
    options: readonly T[];
    labels?: Partial<Record<T, string>>;
    onChange: (value: T) => void;
    size?: 'default' | 'sm';
    className?: string;
}

export function TabFilter<T extends string>({
    label,
    value,
    options,
    labels,
    onChange,
    size,
    className
}: TabFilterProps<T>) {
    const id = useId();
    return (
        <m.fieldset
            layoutScroll
            className={cn(
                'flex min-w-0 items-center gap-1 overflow-x-auto py-1 max-md:no-scrollbar',
                className
            )}
            aria-label={label}
        >
            {options.map((option) => (
                <Button
                    key={option}
                    variant="ghost"
                    size={size}
                    aria-pressed={option === value}
                    onClick={() => onChange(option)}
                    className="relative isolate shrink-0 aria-pressed:text-secondary-foreground aria-pressed:hover:bg-transparent"
                >
                    {option === value && (
                        <m.span
                            layoutId={id}
                            aria-hidden="true"
                            className="absolute inset-0 -z-10 rounded-[inherit] bg-secondary"
                            transition={spring}
                        />
                    )}
                    {labels?.[option] ?? option}
                </Button>
            ))}
        </m.fieldset>
    );
}
