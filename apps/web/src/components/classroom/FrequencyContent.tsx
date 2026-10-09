import { CircleCheck, CircleDashed, CircleSlash, CircleX } from 'lucide-react';

import type { ClassroomFrequency, Lesson, LessonMarkStatus } from '#/queries/classrooms';

import { ListCard, Meter } from '#/components/ListCard';
import { Card } from '#/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '#/components/ui/dropdown-menu';
import {
    formatClassroomDate,
    daysFrom,
    formatClassroomWeekday,
    formatRelativeDay,
    frequencyTone
} from '#/lib/classroom-details';
import { nowInBrasilia } from '#/lib/schedule';
import { cn } from '#/lib/shadcn';

export type MarkLesson = (lesson: Lesson, status: LessonMarkStatus | null) => void;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const FREQUENCY_TONE = {
    ok: undefined,
    warning: 'text-warning',
    danger: 'text-destructive'
} as const;

const LESSON_VIEW = {
    presente: { icon: CircleCheck, color: 'text-primary', name: 'Presença' },
    falta: { icon: CircleX, color: 'text-destructive', name: 'Falta' },
    nao_registrada: { icon: CircleDashed, color: 'text-muted-foreground', name: 'Não registrada' },
    cancelada: { icon: CircleSlash, color: 'text-muted-foreground', name: 'Aula cancelada' }
} as const;

// Marcações que o aluno pode dar a uma aula sem chamada no SIGAA.
const MARKS: LessonMarkStatus[] = ['presente', 'falta', 'cancelada'];

// Aviso no fim da lista de aulas enquanto a frequência não está toda registrada.
const FREQUENCY_NOTICE: Partial<Record<ClassroomFrequency['frequency_status'], string>> = {
    nao_registrada: 'A frequência ainda não foi lançada pelo professor.',
    parcialmente_registrada: 'Algumas aulas ainda não tiveram a frequência registrada.'
};

function lessonLabel(lesson: Lesson) {
    return lesson.status === 'falta'
        ? plural(lesson.absences, 'falta', 'faltas')
        : LESSON_VIEW[lesson.status].name;
}

export function FrequencyContent({
    data,
    onMark,
    pending
}: {
    data: ClassroomFrequency;
    onMark: MarkLesson;
    pending: boolean;
}) {
    const { totals, lessons } = data;
    const notice = FREQUENCY_NOTICE[data.frequency_status];

    return (
        <div className="flex flex-col gap-2">
            <ListCard>
                <Meter
                    label="Andamento das aulas"
                    value={data.progress.percentage}
                    detail={`${data.progress.taught} / ${data.progress.total}`}
                />
            </ListCard>
            {totals && (
                <Card size="sm" className="gap-0 py-0">
                    <dl className="grid grid-cols-3 divide-x divide-border">
                        <Stat label="Presenças" value={totals.presences} />
                        <Stat
                            label="Faltas"
                            value={
                                <>
                                    {totals.absences}
                                    {totals.max_absences !== null && (
                                        <small className="text-sm font-medium text-foreground">
                                            {' '}
                                            / {totals.max_absences}
                                        </small>
                                    )}
                                </>
                            }
                            className={totals.absences > 0 ? 'text-destructive' : undefined}
                        />
                        <Stat
                            label="Frequência"
                            value={`${totals.percentage.toLocaleString('pt-BR')}%`}
                            className={FREQUENCY_TONE[frequencyTone(totals.percentage)]}
                        />
                    </dl>
                </Card>
            )}
            {totals?.estimated && (
                <p className="px-1 text-xs text-muted-foreground">
                    Frequência estimada com as aulas marcadas por você.
                </p>
            )}
            {(lessons.length > 0 || notice) && (
                <section>
                    {lessons.length > 0 && (
                        <h3 className="mb-2 px-1 text-sm font-semibold">
                            Aulas{' '}
                            <span className="font-normal text-muted-foreground">
                                {lessons.length}
                            </span>
                        </h3>
                    )}
                    <ListCard>
                        {lessons.map((lesson) => (
                            <LessonRow
                                key={lesson.id}
                                lesson={lesson}
                                onMark={onMark}
                                pending={pending}
                            />
                        ))}
                        {notice && (
                            <p className="py-2.5 text-center text-sm text-muted-foreground">
                                {notice}
                            </p>
                        )}
                    </ListCard>
                </section>
            )}
        </div>
    );
}

function LessonRow({
    lesson,
    onMark,
    pending
}: {
    lesson: Lesson;
    onMark: MarkLesson;
    pending: boolean;
}) {
    const view = LESSON_VIEW[lesson.status];
    const label = lessonLabel(lesson);
    const editable = lesson.marked || lesson.status === 'nao_registrada';
    // presença e falta tingem a linha toda; os textos secundários só esmaecem
    const tinted = lesson.status === 'presente' || lesson.status === 'falta';
    const days = daysFrom(nowInBrasilia().date, lesson.occurred_on);
    const relativeDay = days === 0 || days === -1 ? formatRelativeDay(days) : null;
    const secondary = tinted ? 'text-xs opacity-70' : 'text-xs text-muted-foreground';

    return (
        <div
            className={cn(
                'flex flex-wrap items-center gap-2 py-2.5 text-sm',
                tinted && view.color,
                lesson.status === 'cancelada' && 'line-through'
            )}
        >
            {editable ? (
                <DropdownMenu>
                    <DropdownMenuTrigger
                        aria-label={`Situação de ${formatClassroomDate(lesson.occurred_on)}, aula: ${label}. Alterar situação.`}
                        disabled={pending}
                        className="relative flex size-4 shrink-0 items-center justify-center rounded-full after:absolute after:-inset-2 after:rounded-full hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                    >
                        <view.icon className={cn('size-4', view.color)} aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-44">
                        {MARKS.map((mark) => {
                            const option = LESSON_VIEW[mark];
                            return (
                                <DropdownMenuItem
                                    key={mark}
                                    disabled={lesson.marked && lesson.status === mark}
                                    onClick={() => onMark(lesson, mark)}
                                >
                                    <option.icon className={option.color} />
                                    {option.name}
                                </DropdownMenuItem>
                            );
                        })}
                        {lesson.marked && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => onMark(lesson, null)}>
                                    <CircleDashed />
                                    Remover marcação
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : (
                <view.icon className={cn('size-4 shrink-0', view.color)} aria-hidden />
            )}
            {relativeDay ? (
                <span>{relativeDay}</span>
            ) : (
                <>
                    <span className="tabular-nums">{formatClassroomDate(lesson.occurred_on)}</span>
                    <span className={secondary}>{formatClassroomWeekday(lesson.occurred_on)}</span>
                </>
            )}
            {lesson.marked && <span className={secondary}>Marcada</span>}
            <span className={cn('ml-auto text-xs font-medium', view.color)}>{label}</span>
        </div>
    );
}

function Stat({
    label,
    value,
    className
}: {
    label: string;
    value: React.ReactNode;
    className?: string;
}) {
    return (
        <div className="px-3 py-3">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd
                className={cn(
                    'mt-1 text-2xl font-semibold tracking-tight text-primary tabular-nums',
                    className
                )}
            >
                {value}
            </dd>
        </div>
    );
}
