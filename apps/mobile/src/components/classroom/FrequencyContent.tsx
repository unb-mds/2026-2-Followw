import type {
    ClassroomFrequency,
    Lesson,
    LessonMarkStatus
} from '@followw/core/queries/classrooms.ts';

import {
    daysFrom,
    formatClassroomDate,
    formatClassroomWeekday,
    formatRelativeDay,
    frequencyTone,
    lessonRuns
} from '@followw/core/lib/classroom-details.ts';
import { nowInBrasilia } from '@followw/core/lib/schedule.ts';
import { Portal } from '@rn-primitives/portal';
import { Circle, CircleCheck, CircleDashed, CircleSlash, CircleX } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListCard, Meter } from '@/components/ListCard';
import { SelectionBar } from '@/components/SelectionBar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

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

const selectable = (lesson: Lesson) => !lesson.marked && lesson.status === 'nao_registrada';

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
    const [menuLesson, setMenuLesson] = useState<Lesson | null>(null);
    // a aula some da seleção quando deixa de ser selecionável (marcada ou registrada)
    const selected = lessons.filter((lesson) => selectable(lesson) && selectedIds.has(lesson.id));

    const marked = lessons.filter((lesson) => lesson.marked);

    const toggle = (lesson: Lesson) =>
        setSelectedIds((ids) => {
            const next = new Set(ids);
            if (next.has(lesson.id)) next.delete(lesson.id);
            else next.add(lesson.id);
            return next;
        });
    const markSelected = (status: LessonMarkStatus) => {
        onMark(selected, status);
        setSelectedIds(new Set());
    };

    return (
        <View className="gap-2">
            <FrequencySummary data={data} />
            {totals?.estimated && (
                <Text className="px-1 text-xs text-muted-foreground">
                    Frequência estimada com as aulas marcadas por você.
                </Text>
            )}
            {(lessons.length > 0 || notice) && (
                <View>
                    {lessons.length > 0 && (
                        <View className="mb-2 flex-row items-center justify-between gap-2 px-1">
                            <Text role="heading" aria-level={3} className="text-sm font-semibold">
                                Aulas{' '}
                                <Text className="text-sm font-normal text-muted-foreground">
                                    {lessons.length}
                                </Text>
                            </Text>
                            {marked.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={pending}
                                    onPress={() => onMark(marked, null)}
                                >
                                    <Text className="text-muted-foreground">Limpar marcações</Text>
                                </Button>
                            )}
                        </View>
                    )}
                    <ListCard>
                        {lessons.map((lesson) => (
                            <LessonRow
                                key={lesson.id}
                                lesson={lesson}
                                pending={pending}
                                selected={selectedIds.has(lesson.id)}
                                onToggle={() => toggle(lesson)}
                                onOpenMenu={() => setMenuLesson(lesson)}
                            />
                        ))}
                        {notice && (
                            <Text className="px-3 py-2.5 text-center text-sm text-muted-foreground">
                                {notice}
                            </Text>
                        )}
                    </ListCard>
                </View>
            )}
            {selected.length > 0 && (
                <FloatingSelection
                    count={selected.length}
                    pending={pending}
                    onClear={() => setSelectedIds(new Set())}
                    onMark={markSelected}
                />
            )}
            <LessonMenu
                lesson={menuLesson}
                onClose={() => setMenuLesson(null)}
                onMark={(lesson, status) => {
                    setMenuLesson(null);
                    onMark([lesson], status);
                }}
            />
        </View>
    );
}

// Acima da tab bar, sobre qualquer scroll (o Portal desenha na raiz do app).
const TAB_BAR_HEIGHT = 56;

function FloatingSelection({
    count,
    pending,
    onClear,
    onMark
}: {
    count: number;
    pending: boolean;
    onClear: () => void;
    onMark: (status: LessonMarkStatus) => void;
}) {
    const insets = useSafeAreaInsets();
    return (
        <Portal name="frequency-selection">
            <View
                pointerEvents="box-none"
                className="absolute inset-x-0 top-0"
                style={{ bottom: insets.bottom + TAB_BAR_HEIGHT }}
            >
                <SelectionBar
                    label="Marcar aulas selecionadas"
                    count={count}
                    units={['aula', 'aulas']}
                    onClear={onClear}
                >
                    {(['presente', 'falta'] as const).map((mark) => {
                        const option = LESSON_VIEW[mark];
                        return (
                            <Button
                                key={mark}
                                variant="ghost"
                                size="sm"
                                disabled={pending}
                                className="rounded-full"
                                onPress={() => onMark(mark)}
                            >
                                <Icon as={option.icon} className={cn('size-4', option.color)} />
                                <Text className={option.color}>{option.name}</Text>
                            </Button>
                        );
                    })}
                </SelectionBar>
            </View>
        </Portal>
    );
}

/** Totais de presença com o andamento das aulas; só o andamento enquanto não há totais. */
export function FrequencySummary({ data }: { data: ClassroomFrequency }) {
    const { totals } = data;

    return totals ? (
        <Card className="gap-0 overflow-hidden py-0">
            <View className="flex-row border-b border-border">
                <Stat label="Presenças" value={String(totals.presences)} />
                <Stat
                    label="Faltas"
                    value={String(totals.absences)}
                    suffix={totals.max_absences !== null ? ` / ${totals.max_absences}` : undefined}
                    className={totals.absences > 0 ? 'text-destructive' : undefined}
                    bordered
                />
                <Stat
                    label="Frequência"
                    value={`${totals.percentage.toLocaleString('pt-BR')}%`}
                    className={FREQUENCY_TONE[frequencyTone(totals.percentage)]}
                    bordered
                />
            </View>
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
        <View className="px-3 py-3">
            <View className="flex-row items-baseline justify-between gap-2">
                <Text className="text-sm font-medium">Andamento das aulas</Text>
                <Text className="text-sm font-semibold text-primary">
                    {percentage.toLocaleString('pt-BR')}%
                </Text>
            </View>
            <View
                role="progressbar"
                aria-label="Andamento das aulas"
                aria-valuenow={filled}
                className="mt-2 h-1.5 flex-row gap-1"
            >
                {filled > 0 && runs.length > 0 && (
                    <View className="flex-row gap-1" style={{ width: `${filled}%` }}>
                        {runs.map((run) => (
                            <View
                                key={run.id}
                                className={cn('min-w-1 rounded-full', RUN_COLOR[run.status])}
                                style={{ flexGrow: run.count }}
                            />
                        ))}
                    </View>
                )}
                {filled < 100 && <View className="flex-1 rounded-full bg-muted" />}
            </View>
            <Text className="mt-1.5 text-xs text-muted-foreground">
                {taught} / {total}
            </Text>
        </View>
    );
}

function LessonRow({
    lesson,
    pending,
    selected,
    onToggle,
    onOpenMenu
}: {
    lesson: Lesson;
    pending: boolean;
    selected: boolean;
    onToggle: () => void;
    onOpenMenu: () => void;
}) {
    const view = LESSON_VIEW[lesson.status];
    const isSelectable = selectable(lesson);
    const interactive = !pending && (isSelectable || lesson.marked);

    // presença e falta tingem a linha toda; os textos secundários só esmaecem
    const tinted = lesson.status === 'presente' || lesson.status === 'falta';
    const days = daysFrom(nowInBrasilia().date, lesson.occurred_on);
    const relativeDay = days === 0 || days === -1 ? formatRelativeDay(days) : null;
    const struck = lesson.status === 'cancelada' ? 'line-through' : undefined;
    const secondary = tinted ? 'text-xs opacity-70' : 'text-xs text-muted-foreground';
    const tint = tinted ? view.color : undefined;
    const date = formatClassroomDate(lesson.occurred_on);

    return (
        <Pressable
            disabled={!interactive}
            onPress={isSelectable ? onToggle : onOpenMenu}
            onLongPress={onOpenMenu}
            accessibilityRole={isSelectable ? 'checkbox' : 'button'}
            accessibilityState={isSelectable ? { checked: selected } : undefined}
            accessibilityLabel={
                isSelectable
                    ? `Selecionar aula de ${date}`
                    : `Situação de ${date}, aula: ${view.name}`
            }
            className={cn(
                'flex-row items-center gap-2 px-3 py-3',
                interactive && 'active:bg-accent',
                selected && 'bg-primary/5'
            )}
        >
            <Icon
                as={isSelectable ? (selected ? CircleCheck : Circle) : view.icon}
                className={cn('size-5 shrink-0', isSelectable ? 'text-primary' : view.color)}
            />
            {relativeDay ? (
                <Text className={cn('text-sm', tint, struck)}>{relativeDay}</Text>
            ) : (
                <>
                    <Text className={cn('text-sm', tint, struck)}>{date}</Text>
                    <Text className={cn(secondary, tint)}>
                        {formatClassroomWeekday(lesson.occurred_on)}
                    </Text>
                </>
            )}
            {lesson.marked && <Text className={cn(secondary, tint)}>Marcada</Text>}
            <Text className={cn('ml-auto text-xs font-medium', view.color)}>{view.name}</Text>
        </Pressable>
    );
}

function LessonMenu({
    lesson,
    onClose,
    onMark
}: {
    lesson: Lesson | null;
    onClose: () => void;
    onMark: (lesson: Lesson, status: LessonMarkStatus | null) => void;
}) {
    return (
        <Dialog open={lesson !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-sm gap-2 p-4">
                {lesson && (
                    <>
                        <DialogHeader className="pr-6">
                            <DialogTitle>
                                Aula de {formatClassroomDate(lesson.occurred_on)}
                            </DialogTitle>
                            <DialogDescription>
                                {formatClassroomWeekday(lesson.occurred_on)}
                            </DialogDescription>
                        </DialogHeader>
                        {MARKS.map((mark) => {
                            const option = LESSON_VIEW[mark];
                            return (
                                <Button
                                    key={mark}
                                    variant="ghost"
                                    className="justify-start"
                                    disabled={lesson.marked && lesson.status === mark}
                                    onPress={() => onMark(lesson, mark)}
                                >
                                    <Icon as={option.icon} className={cn('size-4', option.color)} />
                                    <Text className="font-normal">{option.name}</Text>
                                </Button>
                            );
                        })}
                        {lesson.marked && (
                            <Button
                                variant="ghost"
                                className="justify-start"
                                onPress={() => onMark(lesson, null)}
                            >
                                <Icon as={CircleDashed} className="size-4" />
                                <Text className="font-normal">Remover marcação</Text>
                            </Button>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function Stat({
    label,
    value,
    suffix,
    className,
    bordered
}: {
    label: string;
    value: string;
    suffix?: string;
    className?: string;
    bordered?: boolean;
}) {
    return (
        <View className={cn('flex-1 px-3 py-3', bordered && 'border-l border-border')}>
            <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
            <Text
                className={cn('mt-1 text-2xl font-semibold tracking-tight text-primary', className)}
            >
                {value}
                {suffix && <Text className="text-sm font-medium text-foreground">{suffix}</Text>}
            </Text>
        </View>
    );
}
