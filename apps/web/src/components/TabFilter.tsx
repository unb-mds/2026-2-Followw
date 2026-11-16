import { m } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';

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
    const ref = useRef<HTMLFieldSetElement>(null);
    const [indicator, setIndicator] = useState<{ x: number; width: number } | null>(null);
    useLayoutEffect(() => {
        const group = ref.current;
        if (!group) return undefined;
        const measure = () => {
            const selected =
                group.querySelectorAll('button')[options.findIndex((option) => option === value)];
            const next = selected ? { x: selected.offsetLeft, width: selected.offsetWidth } : null;
            setIndicator((previous) =>
                previous?.x === next?.x && previous?.width === next?.width ? previous : next
            );
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(group);
        for (const button of group.querySelectorAll('button')) observer.observe(button);
        return () => observer.disconnect();
    }, [value, options]);
    return (
        <fieldset
            ref={ref}
            className={cn(
                'relative isolate flex min-w-0 items-center gap-1 overflow-x-auto py-1 max-md:no-scrollbar',
                className
            )}
            aria-label={label}
        >
            {indicator && (
                <m.span
                    aria-hidden="true"
                    className={cn(
                        'pointer-events-none absolute inset-y-1 left-0 bg-secondary',
                        size === 'sm' ? 'rounded-md' : 'rounded-lg'
                    )}
                    initial={false}
                    animate={indicator}
                    transition={spring}
                />
            )}
            {options.map((option) => (
                <Button
                    key={option}
                    variant="ghost"
                    size={size}
                    aria-pressed={option === value}
                    onClick={() => onChange(option)}
                    className={cn(
                        'relative shrink-0 aria-pressed:text-secondary-foreground aria-pressed:hover:bg-transparent',
                        !indicator && 'aria-pressed:bg-secondary'
                    )}
                >
                    {labels?.[option] ?? option}
                </Button>
            ))}
        </fieldset>
    );
}
