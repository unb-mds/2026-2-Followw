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
    return (
        <Select
            disabled={options.length === 0}
            value={value}
            onValueChange={(nextValue) => {
                if (nextValue) onChange(nextValue);
            }}
        >
            <SelectTrigger
                aria-label={label}
                className="h-auto w-full justify-between gap-1.5 bg-card px-2.5 py-2 text-left"
            >
                <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-muted-foreground">{icon}</span>
                    <div className="min-w-0 text-left leading-tight">
                        <span className="block text-xs font-medium text-muted-foreground">
                            {label}
                        </span>
                        <span className="block truncate text-xs font-semibold text-foreground">
                            <SelectValue placeholder="Nenhum disponível" />
                        </span>
                    </div>
                </div>
            </SelectTrigger>
            <SelectContent>
                {options.map((option) => (
                    <SelectItem key={option} value={option}>
                        {option}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
