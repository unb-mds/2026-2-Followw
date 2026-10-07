import type { Day } from '#/lib/schedule';

import { Button } from '#/components/ui/button';

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

interface WeekDayPickerProps {
    days: Day[];
    selectedDate: string;
    onSelect: (day: Day) => void;
}

export function WeekDayPicker({ days, selectedDate, onSelect }: WeekDayPickerProps) {
    return (
        <div
            className="mb-4 flex items-center gap-2 overflow-x-auto py-1"
            aria-label="Escolher dia"
        >
            {days.map((day) => {
                const isActive = day.date === selectedDate;
                return (
                    <Button
                        key={day.date}
                        type="button"
                        variant={isActive ? 'default' : 'outline'}
                        onClick={() => onSelect(day)}
                        aria-label={day.date}
                        aria-pressed={isActive}
                        className="h-16 flex-1 flex-col gap-1"
                    >
                        <span
                            className={`text-xs font-bold tracking-wider uppercase ${
                                isActive ? 'text-primary-foreground/90' : 'text-muted-foreground'
                            }`}
                        >
                            {WEEKDAYS[day.weekday]}
                        </span>
                        <span className="text-lg font-extrabold">{Number(day.date.slice(8))}</span>
                    </Button>
                );
            })}
        </div>
    );
}
