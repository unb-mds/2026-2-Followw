import type { Day } from '@followw/core/lib/schedule.ts';

import { formatDayRange } from '@followw/core/lib/schedule.ts';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { View } from 'react-native';

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
}

export function WeekDayPicker({ days, selectedDate, onSelect, week }: WeekDayPickerProps) {
    return (
        <View className="gap-1">
            {week && <WeekHeader days={days} week={week} />}
            <DayButtons days={days} selectedDate={selectedDate} onSelect={onSelect} />
        </View>
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
                    size="icon"
                    className="size-8"
                    onPress={week.onPrevious}
                    disabled={!week.onPrevious}
                    aria-label="Semana anterior"
                >
                    <Icon as={ChevronLeft} />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onPress={week.onNext}
                    disabled={!week.onNext}
                    aria-label="Próxima semana"
                >
                    <Icon as={ChevronRight} />
                </Button>
            </View>
        </View>
    );
}

function DayButtons({ days, selectedDate, onSelect }: Omit<WeekDayPickerProps, 'week'>) {
    return (
        <View className="flex-row items-center gap-1 py-1" accessibilityLabel="Escolher dia">
            {days.map((day) => {
                const isActive = day.date === selectedDate;
                return (
                    <Button
                        key={day.date}
                        variant={isActive ? 'default' : 'outline'}
                        onPress={() => onSelect(day)}
                        aria-label={day.date}
                        aria-selected={isActive}
                        className="h-16 min-w-0 flex-1 flex-col gap-1 px-0"
                    >
                        <Text
                            className={cn(
                                'text-xs font-bold tracking-wider uppercase',
                                isActive ? 'text-primary-foreground/90' : 'text-muted-foreground'
                            )}
                        >
                            {WEEKDAYS[day.weekday]}
                        </Text>
                        <Text
                            className={cn(
                                'text-lg font-extrabold',
                                isActive ? 'text-primary-foreground' : 'text-foreground'
                            )}
                        >
                            {Number(day.date.slice(8))}
                        </Text>
                    </Button>
                );
            })}
        </View>
    );
}
