import { Progress as ProgressPrimitive } from '@base-ui/react/progress';
import { CircleCheck, CircleDashed, CircleSlash, CircleX } from 'lucide-react';
import { useRef, useState } from 'react';

import type { ClassroomFrequency, Lesson, LessonMarkStatus } from '#/queries/classrooms';

import { ListCard, Meter } from '#/components/ListCard';
import { SelectionBar } from '#/components/SelectionBar';
import { Button } from '#/components/ui/button';
import { Card } from '#/components/ui/card';
import { Checkbox } from '#/components/ui/checkbox';
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

export type MarkLessons = (lessons: Lesson[], status: LessonMarkStatus | null) => void;

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

export function FrequencyContent({
    data,
    onMark,
    pending
}: {
    data: ClassroomFrequency;
    onMark: MarkLessons;
    pending: boolean;
}) {
    const { totals, lessons } = data;
    const notice = FREQUENCY_NOTICE[data.frequency_status];
    const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
    // a aula some da seleção quando deixa de ser selecionável (marcada ou registrada)
    const selected = lessons.filter((lesson) => selectable(lesson) && selectedIds.has(lesson.id));

    const marked = lessons.filter((lesson) => lesson.marked);

    const toggle = (lesson: Lesson, checked: boolean) =>
        setSelectedIds((ids) => {
            const next = new Set(ids);
            if (checked) next.add(lesson.id);
            else next.delete(lesson.id);
            return next;
        });
    const markSelected = (status: LessonMarkStatus) => {
        onMark(selected, status);
        setSelectedIds(new Set());
    };

    return (
        <div className="flex flex-col gap-2">
            <FrequencySummary data={data} />
            {totals?.estimated && (
                <p className="px-1 text-xs text-muted-foreground">
                    Frequência estimada com as aulas marcadas por você.
                </p>
            )}
            {(lessons.length > 0 || notice) && (
                <section>
                    {lessons.length > 0 && (
                        <div className="mb-2 flex items-center justify-between gap-2 px-1">
                            <h3 className="text-sm font-semibold">
                                Aulas{' '}
                                <span className="font-normal text-muted-foreground">
                                    {lessons.length}
                                </span>
                            </h3>
                            {marked.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    disabled={pending}
                                    className="text-muted-foreground"
                                    onClick={() => onMark(marked, null)}
                                >
                                    Limpar marcações
                                </Button>
                            )}
                        </div>
                    )}
                    <ListCard>
                        {lessons.map((lesson) => (
                            <LessonRow
                                key={lesson.id}
                                lesson={lesson}
                                onMark={onMark}
                                pending={pending}
                                selected={selectedIds.has(lesson.id)}
                                onSelect={(checked) => toggle(lesson, checked)}
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
            {selected.length > 0 && (
                <SelectionBar
                    label="Marcar aulas selecionadas"
                    count={selected.length}
                    units={['aula', 'aulas']}
                    onClear={() => setSelectedIds(new Set())}
                >
                    {(['presente', 'falta'] as const).map((mark) => {
                        const option = LESSON_VIEW[mark];
                        return (
                            <Button
                                key={mark}
                                variant="ghost"
                                size="sm"
                                disabled={pending}
                                className={cn('rounded-full', option.color)}
                                onClick={() => markSelected(mark)}
                            >
                                <option.icon />
                                {option.name}
                            </Button>
                        );
                    })}
                </SelectionBar>
            )}
        </div>
    );
}

/** Totais de presença com o andamento das aulas; só o andamento enquanto não há totais. */
export function FrequencySummary({ data }: { data: ClassroomFrequency }) {
    const { totals } = data;

    return totals ? (
        <Card size="sm" className="gap-0 divide-y divide-border py-0">
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
            <LessonsProgress data={data} />
        </Card>
    ) : (
        <ListCard>
            <Meter
                label="Andamento das aulas"
                value={data.progress.percentage}
                detail={`${data.progress.taught} / ${data.progress.total}`}
            />
        </ListCard>
    );
}

const RUN_COLOR = {
    presente: 'bg-primary',
    falta: 'bg-destructive',
    nao_registrada: 'bg-muted-foreground/40'
} as const;

type Run = { id: string; status: keyof typeof RUN_COLOR; count: number };

/** Aulas em ordem cronológica, agrupadas em sequências de mesma situação. */
export function lessonRuns(lessons: Lesson[]): Run[] {
    const runs: Run[] = [];
    for (const lesson of lessons.toReversed()) {
        if (lesson.status === 'cancelada') continue;
        const last = runs.at(-1);
        if (last?.status === lesson.status) last.count++;
        else runs.push({ id: lesson.id, status: lesson.status, count: 1 });
    }
    return runs;
}

/** Andamento das aulas com as dadas divididas em sequências de presenças e faltas. */
function LessonsProgress({ data }: { data: ClassroomFrequency }) {
    const { percentage, taught, total } = data.progress;
    const filled = Math.min(100, Math.max(0, percentage));
    const runs = lessonRuns(data.lessons);

    return (
        <div className="px-3 py-3">
            <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">Andamento das aulas</h3>
                <span className="text-sm font-semibold text-primary tabular-nums">
                    {percentage.toLocaleString('pt-BR')}%
                </span>
            </div>
            <ProgressPrimitive.Root
                value={filled}
                aria-label="Andamento das aulas"
                className="mt-2 flex h-1.5 gap-1"
            >
                {filled > 0 && runs.length > 0 && (
                    <div className="flex gap-1" style={{ width: `${filled}%` }}>
                        {runs.map((run) => (
                            <span
                                key={run.id}
                                className={cn('min-w-1 rounded-full', RUN_COLOR[run.status])}
                                style={{ flexGrow: run.count }}
                            />
                        ))}
                    </div>
                )}
                {filled < 100 && <span className="flex-1 rounded-full bg-muted" />}
            </ProgressPrimitive.Root>
            <p className="mt-1.5 text-xs text-muted-foreground">
                {taught} / {total}
            </p>
        </div>
    );
}

const selectable = (lesson: Lesson) => !lesson.marked && lesson.status === 'nao_registrada';

function LessonRow({
    lesson,
    onMark,
    pending,
    selected,
    onSelect
}: {
    lesson: Lesson;
    onMark: MarkLessons;
    pending: boolean;
    selected: boolean;
    onSelect: (checked: boolean) => void;
}) {
    const view = LESSON_VIEW[lesson.status];
    const label = view.name;

    // presença e falta tingem a linha toda; os textos secundários só esmaecem
    const tinted = lesson.status === 'presente' || lesson.status === 'falta';
    const days = daysFrom(nowInBrasilia().date, lesson.occurred_on);
    const relativeDay = days === 0 || days === -1 ? formatRelativeDay(days) : null;
    const struck = lesson.status === 'cancelada' ? 'line-through' : undefined;
    const secondary = tinted ? 'text-xs opacity-70' : 'text-xs text-muted-foreground';

    return (
        <div
            className={cn('flex flex-wrap items-center gap-2 py-2.5 text-sm', tinted && view.color)}
        >
            {selectable(lesson) ? (
                <SelectableLesson
                    lesson={lesson}
                    onMark={onMark}
                    pending={pending}
                    selected={selected}
                    onSelect={onSelect}
                />
            ) : lesson.marked ? (
                <DropdownMenu>
                    <DropdownMenuTrigger
                        aria-label={`Situação de ${formatClassroomDate(lesson.occurred_on)}, aula: ${label}. Alterar situação.`}
                        disabled={pending}
                        className="relative flex size-4 shrink-0 items-center justify-center rounded-full after:absolute after:-inset-2 after:rounded-full hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                    >
                        <view.icon className={cn('size-4', view.color)} aria-hidden />
                    </DropdownMenuTrigger>
                    <LessonMenuContent lesson={lesson} onMark={onMark} />
                </DropdownMenu>
            ) : (
                <view.icon className={cn('size-4 shrink-0', view.color)} aria-hidden />
            )}
            {relativeDay ? (
                <span className={struck}>{relativeDay}</span>
            ) : (
                <>
                    <span className={cn('tabular-nums', struck)}>
                        {formatClassroomDate(lesson.occurred_on)}
                    </span>
                    <span className={secondary}>{formatClassroomWeekday(lesson.occurred_on)}</span>
                </>
            )}
            {lesson.marked && <span className={secondary}>Marcada</span>}
            <span className={cn('ml-auto text-xs font-medium', view.color)}>{label}</span>
        </div>
    );
}

const LONG_PRESS_MS = 500;

/** Checkbox que, ao ser segurado (ou com clique direito), abre o menu só desta aula. */
function SelectableLesson({
    lesson,
    onMark,
    pending,
    selected,
    onSelect
}: {
    lesson: Lesson;
    onMark: MarkLessons;
    pending: boolean;
    selected: boolean;
    onSelect: (checked: boolean) => void;
}) {
    const [open, setOpen] = useState(false);
    const anchor = useRef<HTMLSpanElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    // o clique que encerra o toque longo não alterna o checkbox
    const pressed = useRef(false);

    const cancel = () => clearTimeout(timer.current);
    const openMenu = () => {
        pressed.current = true;
        setOpen(true);
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <span
                ref={anchor}
                className="flex shrink-0 select-none"
                style={{ WebkitTouchCallout: 'none' }}
                onPointerDown={() => {
                    pressed.current = false;
                    if (!pending) timer.current = setTimeout(openMenu, LONG_PRESS_MS);
                }}
                onPointerUp={cancel}
                onPointerLeave={cancel}
                onPointerCancel={cancel}
                onContextMenu={(event) => {
                    event.preventDefault();
                    cancel();
                    if (!pending) openMenu();
                }}
                onClickCapture={(event) => {
                    if (!pressed.current) return;
                    pressed.current = false;
                    event.preventDefault();
                    event.stopPropagation();
                }}
            >
                <Checkbox
                    aria-label={`Selecionar aula de ${formatClassroomDate(lesson.occurred_on)}`}
                    checked={selected}
                    disabled={pending}
                    onCheckedChange={onSelect}
                    className="rounded-full"
                />
            </span>
            <LessonMenuContent lesson={lesson} onMark={onMark} anchor={anchor} />
        </DropdownMenu>
    );
}

function LessonMenuContent({
    lesson,
    onMark,
    anchor
}: {
    lesson: Lesson;
    onMark: MarkLessons;
    anchor?: React.RefObject<Element | null>;
}) {
    return (
        <DropdownMenuContent className="w-44" anchor={anchor}>
            {MARKS.map((mark) => {
                const option = LESSON_VIEW[mark];
                return (
                    <DropdownMenuItem
                        key={mark}
                        disabled={lesson.marked && lesson.status === mark}
                        onClick={() => onMark([lesson], mark)}
                    >
                        <option.icon className={option.color} />
                        {option.name}
                    </DropdownMenuItem>
                );
            })}
            {lesson.marked && (
                <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onMark([lesson], null)}>
                        <CircleDashed />
                        Remover marcação
                    </DropdownMenuItem>
                </>
            )}
        </DropdownMenuContent>
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
