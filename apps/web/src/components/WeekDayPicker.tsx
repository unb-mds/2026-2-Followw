import type { Day } from '@followw/core/lib/schedule.ts';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { m } from 'motion/react';
import { useId } from 'react';

import { Button } from '#/components/ui/button';
import { spring } from '#/lib/motion';
import { cn } from '#/lib/shadcn';

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
    tiles?: boolean;
}

export function WeekDayPicker({ week, ...dayButtons }: WeekDayPickerProps) {
    return (
        <>
            {week && <WeekHeader days={dayButtons.days} week={week} />}
            <DayButtons {...dayButtons} />
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

function DayButtons({ days, selectedDate, onSelect, tiles }: Omit<WeekDayPickerProps, 'week'>) {
    const id = useId();
    const activeVariant = tiles ? 'ghost' : 'default';
    return (
        <m.div
            layoutScroll
            className={cn(
                'mb-4 flex items-center gap-1 overflow-x-auto px-px py-1',
                tiles && 'sm:gap-2'
            )}
            aria-label="Escolher dia"
        >
            {days.map((day) => {
                const isActive = day.date === selectedDate;
                return (
                    <Button
                        key={day.date}
                        type="button"
                        variant={isActive ? activeVariant : 'outline'}
                        onClick={() => onSelect(day)}
                        aria-label={day.date}
                        aria-pressed={isActive}
                        className={cn(
                            'relative isolate flex-col px-0',
                            tiles
                                ? 'aspect-3/2 h-auto min-h-11 min-w-11 flex-1 gap-0 sm:gap-1'
                                : 'h-16 min-w-0 flex-1 gap-1',
                            isActive && 'bg-transparent hover:bg-transparent',
                            isActive &&
                                tiles &&
                                'text-primary hover:text-primary dark:hover:bg-transparent'
                        )}
                    >
                        {isActive && (
                            <m.span
                                layoutId={id}
                                aria-hidden="true"
                                className={cn(
                                    'absolute -inset-px -z-10 rounded-[inherit]',
                                    tiles
                                        ? 'bg-primary/12 ring-1 ring-primary/30 ring-inset'
                                        : 'bg-primary'
                                )}
                                transition={spring}
                            />
                        )}
                        <span
                            className={cn(
                                'text-xs font-bold uppercase',
                                tiles ? 'leading-tight' : 'tracking-wider',
                                !isActive && 'text-muted-foreground',
                                isActive && !tiles && 'text-primary-foreground/90'
                            )}
                        >
                            {WEEKDAYS[day.weekday]}
                        </span>
                        <span
                            className={
                                tiles ? 'text-sm font-bold sm:text-lg' : 'text-lg font-extrabold'
                            }
                        >
                            {Number(day.date.slice(8))}
                        </span>
                    </Button>
                );
            })}
        </m.div>
    );
}
