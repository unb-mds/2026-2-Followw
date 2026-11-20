import type { Lesson } from '@followw/core/queries/classrooms.ts';

import { getHoliday } from '@followw/core/calendar.ts';
import { lessonsByDay } from '@followw/core/lib/classroom-details.ts';
import { nowInBrasilia } from '@followw/core/lib/schedule.ts';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { LessonMenuContent, markable, type MarkLessons } from '@/components/classroom/LessonMenu';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { dayLabel, MONTHS, monthOf, monthWeeks, shiftMonth } from '@/lib/month';
import { cn } from '@/lib/utils';

type Status = Lesson['status'];

const DOT_COLOR: Partial<Record<Status, string>> = {
    presente: 'bg-primary',
    falta: 'bg-destructive',
    nao_registrada: 'bg-muted-foreground/40'
};

const STATUS_NAME: Record<Status, string> = {
    presente: 'presença',
    falta: 'falta',
    nao_registrada: 'não registrada',
    cancelada: 'aula cancelada'
};

const LEGEND = { presente: 'Presença', falta: 'Falta', nao_registrada: 'Não registrada' };
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function LessonCalendar({
    lessons,
    onMark,
    pending
}: {
    lessons: Lesson[];
    onMark: MarkLessons;
    pending: boolean;
}) {
    const days = useMemo(() => lessonsByDay(lessons), [lessons]);
    const dates = [...days.keys()].toSorted();
    const today = nowInBrasilia().date;
    const start = monthOf(dates[0] ?? today);
    const end = monthOf(dates.at(-1) ?? today);
    // abre no mês atual, se houver aulas nele, ou no mais próximo
    const current = monthOf(today);
    const [month, setMonth] = useState(current < start ? start : current > end ? end : current);
    const [year, index] = month.split('-').map(Number);

    return (
        <Card size="sm" className="items-center px-3">
            <View className="w-full max-w-sm gap-2">
                <View className="flex-row items-center justify-between">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        accessibilityLabel="Mês anterior"
                        disabled={month <= start}
                        onPress={() => setMonth(shiftMonth(month, -1))}
                    >
                        <Icon as={ChevronLeft} className="size-4" />
                    </Button>
                    <Text role="heading" aria-level={4} className="text-sm font-medium">
                        {`${MONTHS[index - 1]} ${year}`}
                    </Text>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        accessibilityLabel="Próximo mês"
                        disabled={month >= end}
                        onPress={() => setMonth(shiftMonth(month, 1))}
                    >
                        <Icon as={ChevronRight} className="size-4" />
                    </Button>
                </View>
                <View className="flex-row">
                    {WEEKDAYS.map((weekday, position) => (
                        <Text
                            // oxlint-disable-next-line react/no-array-index-key -- iniciais se repetem
                            key={position}
                            className="flex-1 text-center text-xs text-muted-foreground"
                        >
                            {weekday}
                        </Text>
                    ))}
                </View>
                {monthWeeks(month).map((week) => (
                    <View key={week.find(Boolean)} className="flex-row">
                        {week.map((day, position) => (
                            <View key={day ?? position} className="flex-1 p-0.5">
                                {day && (
                                    <LessonDay
                                        day={day}
                                        today={day === today}
                                        lessons={days.get(day) ?? []}
                                        onMark={onMark}
                                        pending={pending}
                                    />
                                )}
                            </View>
                        ))}
                    </View>
                ))}
            </View>
            <View className="flex-row flex-wrap justify-center gap-x-4 gap-y-1">
                {(['presente', 'falta', 'nao_registrada'] as const).map((status) => (
                    <View key={status} className="flex-row items-center gap-1.5">
                        <View className={cn('size-1.5 rounded-full', DOT_COLOR[status])} />
                        <Text className="text-xs text-muted-foreground">{LEGEND[status]}</Text>
                    </View>
                ))}
            </View>
        </Card>
    );
}

function LessonDay({
    day,
    today,
    lessons,
    onMark,
    pending
}: {
    day: string;
    today: boolean;
    lessons: Lesson[];
    onMark: MarkLessons;
    pending: boolean;
}) {
    const editable = lessons.filter(markable);
    const cancelled =
        lessons.length > 0 && lessons.every((lesson) => lesson.status === 'cancelada');
    const holiday = getHoliday(day);
    const statuses = lessons.map((lesson) => STATUS_NAME[lesson.status]);
    const name = holiday ? `${dayLabel(day)}, ${holiday.name}` : dayLabel(day);
    const label = statuses.length ? `${name}: ${statuses.join(', ')}` : name;
    const cellClass = cn(
        'aspect-square w-full items-center justify-center gap-1 rounded-lg',
        today && 'bg-muted'
    );
    const content = (
        <>
            <Text
                className={cn(
                    'text-sm',
                    today && 'font-semibold',
                    holiday ? 'text-destructive' : lessons.length === 0 && 'text-muted-foreground',
                    cancelled && 'line-through'
                )}
            >
                {Number(day.slice(8))}
            </Text>
            <View className="h-1.5 flex-row gap-0.5">
                {lessons.map(
                    (lesson) =>
                        DOT_COLOR[lesson.status] && (
                            <View
                                key={lesson.id}
                                className={cn('size-1.5 rounded-full', DOT_COLOR[lesson.status])}
                            />
                        )
                )}
            </View>
        </>
    );
    if (editable.length === 0)
        return (
            <View accessible accessibilityLabel={label} className={cellClass}>
                {content}
            </View>
        );
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                accessibilityLabel={`Marcar aulas de ${dayLabel(day)}`}
                accessibilityHint={label}
                disabled={pending}
                className={cn(cellClass, 'active:bg-muted', pending && 'opacity-50')}
            >
                {content}
            </DropdownMenuTrigger>
            <LessonMenuContent lessons={editable} onMark={onMark} />
        </DropdownMenu>
    );
}
