import { CalendarDays, Download, Plus, X } from 'lucide-react';
import { createContext, useContext, useMemo, useState, useSyncExternalStore } from 'react';

import type { PlannedClass } from '#/lib/planned-schedule';
import type { CatalogSubject, SubjectClassroom } from '#/queries/subjects';

import { ClassCard } from '#/components/home/ClassCard';
import { SelectionBar } from '#/components/SelectionBar';
import { Button } from '#/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '#/components/ui/dialog';
import { Toaster, createToastManager, useToastManager } from '#/components/ui/toast';
import { saveFile } from '#/lib/download';
import { plannedSchedule } from '#/lib/planned-schedule';
import { describeSchedule, parseSchedule, visibleSlots } from '#/lib/schedule';
import { createSchedulePng } from '#/lib/schedule-image';
import { cn } from '#/lib/shadcn';

function classKey({ code, classroom }: PlannedClass) {
    return `${code}-${classroom.semester}-${classroom.number}`;
}

const PlannerContext = createContext<{
    items: PlannedClass[];
    maxHours: number | null;
    toggle: (item: PlannedClass) => void;
    clear: () => void;
} | null>(null);

function semesterHours(items: PlannedClass[], semester: string) {
    return items
        .filter((entry) => entry.classroom.semester === semester)
        .reduce((total, entry) => total + (entry.hours ?? 0), 0);
}

// Carga máxima por período da matriz do aluno.
function exceedsLimit(items: PlannedClass[], item: PlannedClass, maxHours: number | null) {
    return (
        maxHours != null &&
        semesterHours(items, item.classroom.semester) + (item.hours ?? 0) > maxHours
    );
}

// Mesma matéria no semestre ou horário sobreposto impedem a adição.
function conflictOf(items: PlannedClass[], item: PlannedClass) {
    const times = parseSchedule(item.classroom.schedule);
    return items.find(
        (entry) =>
            entry.classroom.semester === item.classroom.semester &&
            (entry.code === item.code ||
                parseSchedule(entry.classroom.schedule).some((existing) =>
                    times.some(
                        (time) =>
                            time.weekday === existing.weekday &&
                            time.start < existing.end &&
                            time.end > existing.start
                    )
                ))
    );
}

function toggleItem(item: PlannedClass, maxHours: number | null): string | null {
    const items = plannedSchedule.getSnapshot();
    if (items.some((entry) => classKey(entry) === classKey(item))) {
        plannedSchedule.set(items.filter((entry) => classKey(entry) !== classKey(item)));
        return null;
    }
    const conflict = conflictOf(items, item);
    if (conflict) {
        return conflict.code === item.code
            ? `${item.name} (${item.code}) já está na grade do semestre ${item.classroom.semester}, na turma ${conflict.classroom.number}.`
            : `O horário de ${item.name} (${item.code}) conflita com ${conflict.name} (${conflict.code}), turma ${conflict.classroom.number}.`;
    }
    if (exceedsLimit(items, item, maxHours)) {
        return `Adicionar ${item.name} ultrapassa a carga horária máxima de ${maxHours}h no semestre ${item.classroom.semester}.`;
    }
    plannedSchedule.set([...items, item]);
    return null;
}

export function SchedulePlanner(props: { maxHours?: number | null; children: React.ReactNode }) {
    const [toastManager] = useState(createToastManager);
    return (
        <Toaster toastManager={toastManager} limit={1}>
            <Planner {...props} />
        </Toaster>
    );
}

function Planner({
    maxHours = null,
    children
}: {
    maxHours?: number | null;
    children: React.ReactNode;
}) {
    const { add } = useToastManager();
    const items = useSyncExternalStore(
        plannedSchedule.subscribe,
        plannedSchedule.getSnapshot,
        plannedSchedule.getServerSnapshot
    );
    const value = useMemo(
        () => ({
            items,
            maxHours,
            toggle: (item: PlannedClass) => {
                const description = toggleItem(item, maxHours);
                if (description) {
                    add({
                        id: 'schedule-conflict',
                        type: 'warning',
                        title: 'Não foi possível adicionar à grade',
                        description
                    });
                }
            },
            clear: plannedSchedule.clear
        }),
        [items, maxHours, add]
    );

    return <PlannerContext value={value}>{children}</PlannerContext>;
}

export function AddToSchedule({
    subject,
    classroom
}: {
    subject: CatalogSubject;
    classroom: SubjectClassroom;
}) {
    const planner = useContext(PlannerContext);
    if (!planner) return null;
    const item = {
        code: subject.code,
        name: subject.name,
        hours: subject.hours ?? null,
        classroom
    };
    const selected = planner.items.some((entry) => classKey(entry) === classKey(item));

    return (
        <Button
            variant={selected ? 'destructive' : 'ghost'}
            size="icon-lg"
            className={cn(
                'rounded-xl',
                !selected && 'bg-primary/15 text-primary hover:bg-primary/25 hover:text-primary'
            )}
            aria-pressed={selected}
            aria-label={`${selected ? 'Remover da' : 'Adicionar à'} grade: ${subject.code}, turma ${classroom.number}`}
            onClick={() => planner.toggle(item)}
        >
            {selected ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
        </Button>
    );
}

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function WeeklyTable({
    items,
    semester,
    maxHours,
    action
}: {
    items: PlannedClass[];
    semester: string;
    maxHours: number | null;
    action?: React.ReactNode;
}) {
    const hours = semesterHours(items, semester);
    const entries = items.map((item) => ({
        ...item,
        times: parseSchedule(item.classroom.schedule)
    }));
    const visibleRows = visibleSlots(entries.flatMap((entry) => entry.times));

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                    <h3 className="text-base font-semibold">Semestre {semester}</h3>
                    <p
                        className={cn(
                            'text-xs text-muted-foreground tabular-nums',
                            maxHours != null && hours > maxHours && 'text-destructive'
                        )}
                    >
                        {maxHours == null ? `${hours}h` : `${hours}h de ${maxHours}h`}
                    </p>
                </div>
                {action}
            </div>
            {visibleRows.length > 0 && (
                <section
                    className="overflow-x-auto rounded-lg border"
                    aria-label={`Grade semanal ${semester}`}
                >
                    <table className="w-full min-w-2xl table-fixed border-collapse text-center text-xs">
                        <caption className="sr-only">Grade semanal · {semester}.</caption>
                        <thead className="bg-foreground text-background dark:bg-background dark:text-foreground">
                            <tr>
                                <th scope="col" className="w-24 p-2">
                                    Horários
                                </th>
                                {DAYS.map((day) => (
                                    <th key={day} scope="col" className="p-2">
                                        {day}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.map(([start, end]) => (
                                <tr key={start} className="border-t">
                                    <th
                                        scope="row"
                                        className="bg-muted p-2 font-medium tabular-nums"
                                    >
                                        {start}–{end}
                                    </th>
                                    {DAYS.map((day, weekday) => {
                                        const classes = entries.filter((entry) =>
                                            entry.times.some(
                                                (time) =>
                                                    time.weekday === weekday + 1 &&
                                                    time.start < end &&
                                                    time.end > start
                                            )
                                        );
                                        return (
                                            <td
                                                key={day}
                                                className={cn(
                                                    'border-l p-2 align-middle',
                                                    classes.length === 1 &&
                                                        'bg-primary/5 text-primary'
                                                )}
                                            >
                                                <div className="flex flex-col gap-1">
                                                    {classes.length ? (
                                                        classes.map((entry) => (
                                                            <span
                                                                key={classKey(entry)}
                                                                title={entry.name}
                                                                className="font-semibold"
                                                            >
                                                                {entry.code}
                                                                <span className="block font-normal">
                                                                    T{entry.classroom.number}
                                                                </span>
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-muted-foreground">
                                                            —
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}
            {entries
                .filter((entry) => entry.times.length === 0)
                .map((entry) => (
                    <p key={classKey(entry)} className="text-sm text-muted-foreground">
                        {entry.code} · T{entry.classroom.number}: horário a definir.
                    </p>
                ))}
        </div>
    );
}

export function SchedulePreview() {
    const planner = useContext(PlannerContext);
    const [open, setOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState(false);
    if (!planner) return null;
    const { items, maxHours, toggle, clear } = planner;
    const download = async () => {
        setExporting(true);
        setExportError(false);
        try {
            saveFile(await createSchedulePng(items), 'minha-grade-followw.png');
        } catch {
            setExportError(true);
        } finally {
            setExporting(false);
        }
    };
    const semesters = [...new Set(items.map((item) => item.classroom.semester))];
    const closeButton = (
        <DialogClose
            onClick={() => setOpen(false)}
            render={<Button variant="ghost" size="icon-sm" />}
            aria-label="Fechar grade semanal"
        >
            <X aria-hidden="true" />
        </DialogClose>
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {items.length > 0 && (
                <SelectionBar
                    label="Turmas selecionadas"
                    count={items.length}
                    units={['turma', 'turmas']}
                    onClear={clear}
                >
                    <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full text-primary"
                        render={<DialogTrigger />}
                        onClick={() => setOpen(true)}
                    >
                        <CalendarDays aria-hidden="true" />
                        Ver grade
                    </Button>
                </SelectionBar>
            )}
            <DialogContent
                className="max-h-9/10 overflow-y-auto rounded-2xl sm:max-w-3xl"
                showCloseButton={false}
            >
                <DialogHeader
                    className={cn(
                        semesters.length > 0
                            ? 'sr-only'
                            : 'flex-row items-center justify-between gap-3'
                    )}
                >
                    <DialogTitle>Minha grade semanal</DialogTitle>
                    {semesters.length === 0 && closeButton}
                </DialogHeader>
                {semesters.map((semester, index) => (
                    <WeeklyTable
                        key={semester}
                        semester={semester}
                        maxHours={maxHours}
                        items={items.filter((item) => item.classroom.semester === semester)}
                        action={index === 0 ? closeButton : undefined}
                    />
                ))}
                <div className="flex min-w-0 flex-col gap-4">
                    {items.length === 0 ? (
                        <p className="text-muted-foreground">
                            Adicione turmas nos resultados da busca para montar sua grade.
                        </p>
                    ) : (
                        <>
                            <ul className="flex flex-col gap-2">
                                {items.map((item) => (
                                    <li key={classKey(item)}>
                                        <ClassCard
                                            compact
                                            title={item.name}
                                            code={item.code}
                                            classNumber={item.classroom.number}
                                            time={
                                                describeSchedule(item.classroom.schedule) ??
                                                'Horário a definir'
                                            }
                                            location={item.classroom.room ?? undefined}
                                            professors={item.classroom.professors}
                                            action={
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                    aria-label={`Remover da grade: ${item.code}, turma ${item.classroom.number}`}
                                                    onClick={() => toggle(item)}
                                                >
                                                    <X aria-hidden="true" />
                                                </Button>
                                            }
                                        />
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
                <Button
                    variant="outline"
                    disabled={items.length === 0 || exporting}
                    onClick={() => void download()}
                >
                    <Download aria-hidden="true" />
                    {exporting ? 'Gerando imagem...' : 'Baixar imagem'}
                </Button>
                {exportError && (
                    <p role="alert" className="text-sm text-destructive">
                        Não foi possível baixar a grade. Tente novamente.
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
}
