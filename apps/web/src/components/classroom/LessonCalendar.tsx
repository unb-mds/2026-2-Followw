import type { DayProps } from 'react-day-picker';

import { createContext, use } from 'react';
import { ptBR } from 'react-day-picker/locale';

import type { Lesson } from '#/queries/classrooms';

import { getHoliday } from '#/calendar';
import { Calendar } from '#/components/ui/calendar';
import { Card } from '#/components/ui/card';
import { nowInBrasilia } from '#/lib/schedule';
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

const DaysContext = createContext<Map<string, Lesson[]>>(new Map());

const LEGEND = { presente: 'Presença', falta: 'Falta', nao_registrada: 'Não registrada' };

const dayLabel = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' });

/** Situações das aulas de cada dia, em ordem cronológica. */
export function lessonsByDay(lessons: Lesson[]) {
    const days = new Map<string, Lesson[]>();
    for (const lesson of lessons.toReversed()) {
        const key = lesson.occurred_on.slice(0, 10);
        days.set(key, [...(days.get(key) ?? []), lesson]);
    }
    return days;
}

const toDate = (iso: string) => {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day);
};

const isoOf = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function LessonDay({ day, modifiers, children, className, ...props }: DayProps) {
    const lessons = use(DaysContext).get(day.isoDate) ?? [];
    const cancelled = lessons.length > 0 && lessons.every((l) => l.status === 'cancelada');
    return (
        <td {...props} className={cn(className, 'p-0.5')}>
            <div
                className={cn(
                    'flex aspect-square flex-col items-center justify-center gap-1 rounded-(--cell-radius) text-sm tabular-nums',
                    modifiers.today && 'bg-muted font-semibold',
                    getHoliday(day.isoDate)
                        ? 'text-destructive'
                        : lessons.length === 0 && 'text-muted-foreground',
                    cancelled && 'line-through'
                )}
            >
                {children}
                <span aria-hidden="true" className="flex h-1.5 gap-0.5">
                    {lessons.map(
                        (lesson) =>
                            DOT_COLOR[lesson.status] && (
                                <span
                                    key={lesson.id}
                                    className={cn(
                                        'size-1.5 rounded-full',
                                        DOT_COLOR[lesson.status]
                                    )}
                                />
                            )
                    )}
                </span>
            </div>
        </td>
    );
}

export function LessonCalendar({ lessons }: { lessons: Lesson[] }) {
    const days = lessonsByDay(lessons);
    const dates = [...days.keys()].toSorted();
    const today = toDate(nowInBrasilia().date);
    const start = dates[0] ? toDate(dates[0]) : today;
    const last = dates.at(-1);
    const end = last ? toDate(last) : today;
    // abre no mês atual, se houver aulas nele, ou no mais próximo
    const month = today < start ? start : today > end ? end : today;

    return (
        <DaysContext value={days}>
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
                            const statuses = (days.get(isoOf(date)) ?? []).map(
                                (l) => STATUS_NAME[l.status]
                            );
                            const holiday = getHoliday(isoOf(date));
                            const label = holiday
                                ? `${dayLabel.format(date)}, ${holiday.name}`
                                : dayLabel.format(date);
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
        </DaysContext>
    );
}
