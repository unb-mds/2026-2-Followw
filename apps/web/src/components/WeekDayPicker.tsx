import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { Day } from '#/lib/schedule';

import { Button } from '#/components/ui/button';

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const dayMonth = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
});

// Sem `onPrevious`/`onNext`, a seta correspondente fica desabilitada.
interface WeekNavigation {
    label: string;
    onPrevious?: () => void;
    onNext?: () => void;
}

interface WeekDayPickerProps {
    days: Day[];
    selectedDate: string;
    onSelect: (day: Day) => void;
    week?: WeekNavigation;
}

export function WeekDayPicker({ days, selectedDate, onSelect, week }: WeekDayPickerProps) {
    return (
        <>
            {week && <WeekHeader days={days} week={week} />}
            <DayButtons days={days} selectedDate={selectedDate} onSelect={onSelect} />
        </>
    );
}

function WeekHeader({ days, week }: { days: Day[]; week: WeekNavigation }) {
    const range = dayMonth.formatRange(
        new Date(`${days[0].date}T00:00:00Z`),
        new Date(`${days[days.length - 1].date}T00:00:00Z`)
    );

    return (
        <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-xs text-muted-foreground" aria-live="polite">
                <span className="font-bold text-foreground">{week.label}</span> · {range}
            </p>
            <div className="flex gap-1">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={week.onPrevious}
                    disabled={!week.onPrevious}
                    aria-label="Semana anterior"
                >
                    <ChevronLeft />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={week.onNext}
                    disabled={!week.onNext}
                    aria-label="Próxima semana"
                >
                    <ChevronRight />
                </Button>
            </div>
        </div>
    );
}

function DayButtons({ days, selectedDate, onSelect }: Omit<WeekDayPickerProps, 'week'>) {
    return (
        <div
            className="mb-4 flex items-center gap-1 overflow-x-auto py-1"
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
                        className="h-16 min-w-0 flex-1 flex-col gap-1 px-0"
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
