import type { Day } from '@followw/core/lib/schedule.ts';

import { formatDayRange } from '@followw/core/lib/schedule.ts';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { View } from 'react-native';

import { Highlight, useSlidingHighlight } from '@/components/SlidingHighlight';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

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
    variant?: keyof typeof variants;
}

// `tiles` é a grade compacta da home; `solid`, a faixa preenchida do RU.
const variants = {
    solid: {
        row: '',
        button: 'h-16 min-w-0 flex-1 gap-1',
        highlight: 'rounded-lg bg-primary',
        weekday: 'tracking-wider',
        activeWeekday: 'text-primary-foreground/90',
        date: 'text-lg font-extrabold',
        activeDate: 'text-primary-foreground'
    },
    tiles: {
        row: '',
        button: 'aspect-3/2 h-auto min-h-11 min-w-11 flex-1 gap-0',
        highlight: 'rounded-lg border border-primary/30 bg-primary/12',
        weekday: 'leading-tight',
        activeWeekday: 'text-primary',
        date: 'text-sm font-bold',
        activeDate: 'text-primary'
    }
} as const;

export function WeekDayPicker({ week, ...dayButtons }: WeekDayPickerProps) {
    return (
        <>
            {week && <WeekHeader days={dayButtons.days} week={week} />}
            <DayButtons {...dayButtons} />
        </>
    );
}

function WeekHeader({ days, week }: { days: Day[]; week: WeekNavigation }) {
    const range = formatDayRange(days[0].date, days[days.length - 1].date);

    return (
        <View className="flex-row items-center justify-between gap-2 px-1">
            <Text className="text-xs text-muted-foreground" accessibilityLiveRegion="polite">
                <Text className="text-xs font-bold text-foreground">{week.label}</Text> · {range}
            </Text>
            <View className="flex-row gap-1">
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onPress={week.onPrevious}
                    disabled={!week.onPrevious}
                    aria-label="Semana anterior"
                >
                    <Icon as={ChevronLeft} className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onPress={week.onNext}
                    disabled={!week.onNext}
                    aria-label="Próxima semana"
                >
                    <Icon as={ChevronRight} className="size-4" />
                </Button>
            </View>
        </View>
    );
}

function DayButtons({
    days,
    selectedDate,
    onSelect,
    variant = 'solid'
}: Omit<WeekDayPickerProps, 'week'>) {
    const style = variants[variant];
    const highlight = useSlidingHighlight(selectedDate);
    return (
        <View
            className={cn('mb-4 flex-row items-center gap-1 py-1', style.row)}
            accessibilityLabel="Escolher dia"
        >
            <Highlight highlight={highlight} top={4} className={style.highlight} />
            {days.map((day) => {
                const isActive = day.date === selectedDate;
                return (
                    <Button
                        key={day.date}
                        variant={isActive ? 'ghost' : 'outline'}
                        onPress={() => onSelect(day)}
                        onLayout={highlight.measure(day.date)}
                        aria-label={day.date}
                        accessibilityState={{ selected: isActive }}
                        className={cn(
                            'flex-col px-0',
                            style.button,
                            isActive && 'active:bg-transparent'
                        )}
                    >
                        <Text
                            className={cn(
                                'text-xs font-bold uppercase',
                                style.weekday,
                                isActive ? style.activeWeekday : 'text-muted-foreground'
                            )}
                        >
                            {WEEKDAYS[day.weekday]}
                        </Text>
                        <Text className={cn(style.date, isActive && style.activeDate)}>
                            {Number(day.date.slice(8))}
                        </Text>
                    </Button>
                );
            })}
        </View>
    );
}
