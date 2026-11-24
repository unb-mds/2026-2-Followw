import type { Lesson } from '@followw/core/queries/classrooms.ts';
import type { DayProps } from 'react-day-picker';

import { getHoliday } from '@followw/core/calendar.ts';
import { nowInBrasilia } from '@followw/core/lib/schedule.ts';
import { createContext, use, useMemo } from 'react';
import { ptBR } from 'react-day-picker/locale';

import { lessonsByDay, markable, type MarkLessons } from '#/components/classroom/lesson-utils';
import { LessonMenuContent } from '#/components/classroom/LessonMenu';
import { Calendar } from '#/components/ui/calendar';
import { Card } from '#/components/ui/card';
import { DropdownMenu, DropdownMenuTrigger } from '#/components/ui/dropdown-menu';
import { cn } from '#/lib/shadcn';

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

interface CalendarState {
    days: Map<string, Lesson[]>;
    onMark: MarkLessons;
    pending: boolean;
}

const CalendarContext = createContext<CalendarState>({
    days: new Map(),
    onMark: () => {},
    pending: false
});

const LEGEND = { presente: 'Presença', falta: 'Falta', nao_registrada: 'Não registrada' };

const dayLabel = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
});

const formatDayLabel = (isoDate: string) => dayLabel.format(new Date(`${isoDate}T12:00:00Z`));

const toDate = (iso: string) => {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day);
};

const isoOf = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function LessonDay({ day, modifiers, children, className, ...props }: DayProps) {
    const { days, onMark, pending } = use(CalendarContext);
    const lessons = days.get(day.isoDate) ?? [];
    const editable = lessons.filter(markable);
    const cancelled = lessons.length > 0 && lessons.every((l) => l.status === 'cancelada');
    const cellClass = cn(
        'flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-(--cell-radius) text-sm tabular-nums',
        modifiers.today && 'bg-muted font-semibold',
        getHoliday(day.isoDate)
            ? 'text-destructive'
            : lessons.length === 0 && 'text-muted-foreground',
        cancelled && 'line-through'
    );
    const content = (
        <>
            {children}
            <span aria-hidden="true" className="flex h-1.5 gap-0.5">
                {lessons.map(
                    (lesson) =>
                        DOT_COLOR[lesson.status] && (
                            <span
                                key={lesson.id}
                                className={cn('size-1.5 rounded-full', DOT_COLOR[lesson.status])}
                            />
                        )
                )}
            </span>
        </>
    );
    return (
        <td {...props} className={cn(className, 'p-0.5')}>
            {editable.length > 0 ? (
                <DropdownMenu>
                    <DropdownMenuTrigger
                        aria-label={`Marcar aulas de ${formatDayLabel(day.isoDate)}`}
                        disabled={pending}
                        className={cn(
                            cellClass,
                            'cursor-pointer hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50'
                        )}
                    >
                        {content}
                    </DropdownMenuTrigger>
                    <LessonMenuContent lessons={editable} onMark={onMark} />
                </DropdownMenu>
            ) : (
                <div className={cellClass}>{content}</div>
            )}
        </td>
    );
}

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
    const state = useMemo(() => ({ days, onMark, pending }), [days, onMark, pending]);
    const dates = [...days.keys()].toSorted();
    const today = toDate(nowInBrasilia().date);
    const start = dates[0] ? toDate(dates[0]) : today;
    const last = dates.at(-1);
    const end = last ? toDate(last) : today;
    // abre no mês atual, se houver aulas nele, ou no mais próximo
    const month = today < start ? start : today > end ? end : today;

    return (
        <CalendarContext value={state}>
            <Card size="sm" className="items-center px-3">
                <Calendar
                    locale={ptBR}
                    today={today}
                    defaultMonth={month}
                    startMonth={start}
                    endMonth={end}
                    showOutsideDays={false}
                    className="w-full max-w-sm bg-transparent p-0 [--cell-size:--spacing(9)]"
                    classNames={{ root: 'w-full', day: 'flex-1' }}
                    components={{ Day: LessonDay }}
                    labels={{
                        labelGridcell: (date) => {
                            const iso = isoOf(date);
                            const statuses = (days.get(iso) ?? []).map(
                                (l) => STATUS_NAME[l.status]
                            );
                            const holiday = getHoliday(iso);
                            const formatted = formatDayLabel(iso);
                            const label = holiday ? `${formatted}, ${holiday.name}` : formatted;
                            return statuses.length ? `${label}: ${statuses.join(', ')}` : label;
                        }
                    }}
                />
                <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {(['presente', 'falta', 'nao_registrada'] as const).map((status) => (
                        <li key={status} className="flex items-center gap-1.5">
                            <span
                                aria-hidden="true"
                                className={cn('size-1.5 rounded-full', DOT_COLOR[status])}
                            />
                            {LEGEND[status]}
                        </li>
                    ))}
                </ul>
            </Card>
        </CalendarContext>
    );
}
