import type {
    ClassroomFrequency,
    Lesson,
    LessonMarkStatus
} from '@followw/core/queries/classrooms.ts';

import { Progress as ProgressPrimitive } from '@base-ui/react/progress';
import {
    formatClassroomDate,
    daysFrom,
    formatClassroomWeekday,
    formatRelativeDay,
    frequencyTone,
    isLessonSelectable,
    lessonRuns,
    type MarkLessons
} from '@followw/core/lib/classroom-details.ts';
import { nowInBrasilia } from '@followw/core/lib/schedule.ts';
import { CalendarDays, List } from 'lucide-react';
import { useRef, useState } from 'react';

import { LESSON_VIEW } from '#/components/classroom/lesson-utils';
import { LessonCalendar } from '#/components/classroom/LessonCalendar';
import { LessonMenuContent } from '#/components/classroom/LessonMenu';
import { ListCard, Meter } from '#/components/ListCard';
import { SelectionBar } from '#/components/SelectionBar';
import { Button } from '#/components/ui/button';
import { Card } from '#/components/ui/card';
import { Checkbox } from '#/components/ui/checkbox';
import { DropdownMenu, DropdownMenuTrigger } from '#/components/ui/dropdown-menu';
import { Skeleton } from '#/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group';
import { repeat } from '#/lib/repeat';
import { cn } from '#/lib/shadcn';

const FREQUENCY_TONE = {
    ok: undefined,
    warning: 'text-warning',
    danger: 'text-destructive'
} as const;

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
    const [view, setView] = useState<'list' | 'calendar'>('list');
    // a aula some da seleção quando deixa de ser selecionável (marcada ou registrada)
    const selected = lessons.filter(
        (lesson) => isLessonSelectable(lesson) && selectedIds.has(lesson.id)
    );

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
                        <div className="mb-2 flex items-center gap-2 px-1">
                            <h3 className="text-sm font-semibold">
                                Aulas{' '}
                                <span className="font-normal text-muted-foreground">
                                    {lessons.length}
                                </span>
                            </h3>
                            {marked.length > 0 && view === 'list' && (
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    disabled={pending}
                                    className="ml-auto text-muted-foreground"
                                    onClick={() => onMark(marked, null)}
                                >
                                    Limpar marcações
                                </Button>
                            )}
                            <ToggleGroup
                                aria-label="Visualização das aulas"
                                size="sm"
                                spacing={0}
                                variant="outline"
                                value={[view]}
                                onValueChange={([next]) => {
                                    if (!next) return;
                                    setView(next === 'calendar' ? 'calendar' : 'list');
                                    setSelectedIds(new Set());
                                }}
                                className={
                                    marked.length > 0 && view === 'list' ? undefined : 'ml-auto'
                                }
                            >
                                <ToggleGroupItem value="list" aria-label="Lista" title="Lista">
                                    <List />
                                </ToggleGroupItem>
                                <ToggleGroupItem
                                    value="calendar"
                                    aria-label="Calendário"
                                    title="Calendário"
                                >
                                    <CalendarDays />
                                </ToggleGroupItem>
                            </ToggleGroup>
                        </div>
                    )}
                    {view === 'calendar' && lessons.length > 0 ? (
                        <div className="flex flex-col gap-2">
                            <LessonCalendar lessons={lessons} onMark={onMark} pending={pending} />
                            {notice && (
                                <p className="px-1 text-center text-sm text-muted-foreground">
                                    {notice}
                                </p>
                            )}
                        </div>
                    ) : (
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
                    )}
                </section>
            )}
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

/** Andamento das aulas com as dadas divididas em sequências de presenças e faltas. */
function LessonsProgress({ data }: { data: ClassroomFrequency }) {
    const { percentage, taught, total } = data.progress;
    const filled = Math.min(100, Math.max(0, percentage));
    const runs = lessonRuns(data.lessons);

    return (
        <div className="p-3">
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
            {isLessonSelectable(lesson) ? (
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
                    <LessonMenuContent lessons={[lesson]} onMark={onMark} />
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
            >
                <Checkbox
                    aria-label={`Selecionar aula de ${formatClassroomDate(lesson.occurred_on)}`}
                    checked={selected}
                    disabled={pending}
                    onCheckedChange={onSelect}
                    onKeyDown={() => {
                        // pelo teclado não há toque longo a ignorar
                        pressed.current = false;
                    }}
                    onClickCapture={(event) => {
                        if (!pressed.current) return;
                        pressed.current = false;
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                    className="rounded-full"
                />
            </span>
            <LessonMenuContent lessons={[lesson]} onMark={onMark} anchor={anchor} />
        </DropdownMenu>
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
        <div className="p-3">
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

export function FrequencySummarySkeleton() {
    return (
        <Card size="sm" className="gap-0 divide-y divide-border py-0">
            <div className="grid grid-cols-3 divide-x divide-border">
                {repeat(3, () => (
                    <div className="flex flex-col gap-2 p-3">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-7 w-12" />
                    </div>
                ))}
            </div>
            <div className="flex flex-col gap-2 p-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-2 w-full" />
            </div>
        </Card>
    );
}

export function FrequencyContentSkeleton() {
    return (
        <>
            <FrequencySummarySkeleton />
            <Skeleton className="mt-2 h-5 w-24" />
            <ListCard>
                {repeat(6, () => (
                    <div className="flex items-center gap-2 py-2.5">
                        <Skeleton className="size-4 shrink-0 rounded-full" />
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="ml-auto h-6 w-20 rounded-full" />
                    </div>
                ))}
            </ListCard>
        </>
    );
}
