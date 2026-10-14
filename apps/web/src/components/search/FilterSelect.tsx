import { useId } from 'react';

import { Label } from '#/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '#/components/ui/select';

interface FilterSelectProps {
    label: string;
    icon: React.ReactNode;
    value: string;
    options: readonly string[];
    onChange: (value: string) => void;
}

export function FilterSelect({ label, icon, value, options, onChange }: FilterSelectProps) {
    const id = useId();

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor={id} className="text-xs text-muted-foreground">
                {label}
            </Label>
            <Select
                disabled={options.length === 0}
                value={value}
                onValueChange={(nextValue) => {
                    if (nextValue) onChange(nextValue);
                }}
            >
                <SelectTrigger id={id} className="w-full justify-between gap-2 bg-card">
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-muted-foreground">{icon}</span>
                        <span className="truncate text-sm font-medium">
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
