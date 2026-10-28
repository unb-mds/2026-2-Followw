import { CalendarDays, Download, Plus, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { CatalogSubject, SubjectClassroom } from '#/queries/subjects';

import { Button } from '#/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '#/components/ui/dialog';
import { saveFile } from '#/lib/download';
import { parseSchedule, SCHEDULE_SLOTS } from '#/lib/schedule';
import { createSchedulePng } from '#/lib/schedule-image';
import { cn } from '#/lib/shadcn';

interface PlannedClass {
    code: string;
    name: string;
    classroom: SubjectClassroom;
}

function classKey({ code, classroom }: PlannedClass) {
    return `${code}-${classroom.semester}-${classroom.number}`;
}

const PlannerContext = createContext<{
    items: PlannedClass[];
    toggle: (item: PlannedClass) => void;
} | null>(null);

export function SchedulePlanner({ children }: { children: React.ReactNode }) {
    const [{ items, conflict }, setState] = useState<{
        items: PlannedClass[];
        conflict: { message: string } | null;
    }>({ items: [], conflict: null });
    const toggle = useCallback(
        (item: PlannedClass) =>
            setState(({ items: previous }) => {
                if (previous.some((entry) => classKey(entry) === classKey(item))) {
                    return {
                        items: previous.filter((entry) => classKey(entry) !== classKey(item)),
                        conflict: null
                    };
                }
                const duplicate = previous.find(
                    (entry) =>
                        entry.code === item.code &&
                        entry.classroom.semester === item.classroom.semester
                );
                if (duplicate) {
                    return {
                        items: previous,
                        conflict: {
                            message: `${item.name} já está na grade com a turma ${duplicate.classroom.number}. Remova essa turma antes de adicionar outra da mesma matéria.`
                        }
                    };
                }
                const times = parseSchedule(item.classroom.schedule);
                const conflicts = previous.filter(
                    (entry) =>
                        entry.classroom.semester === item.classroom.semester &&
                        parseSchedule(entry.classroom.schedule).some((existing) =>
                            times.some(
                                (time) =>
                                    time.weekday === existing.weekday &&
                                    time.start < existing.end &&
                                    time.end > existing.start
                            )
                        )
                );
                if (conflicts.length > 0) {
                    return {
                        items: previous,
                        conflict: {
                            message: `Não foi possível adicionar ${item.name} · Turma ${item.classroom.number}: horário em conflito com ${conflicts.map((entry) => `${entry.name} · Turma ${entry.classroom.number}`).join('; ')}.`
                        }
                    };
                }
                return { items: [...previous, item], conflict: null };
            }),
        []
    );
    useEffect(() => {
        if (!conflict) return undefined;
        const timer = setTimeout(
            () => setState((previous) => ({ ...previous, conflict: null })),
            2000
        );
        return () => clearTimeout(timer);
    }, [conflict]);
    const value = useMemo(() => ({ items, toggle }), [items, toggle]);

    return (
        <PlannerContext value={value}>
            {children}
            {conflict && (
                <div
                    role="alert"
                    aria-atomic="true"
                    className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-lg -translate-y-1/2 rounded-xl border border-destructive/30 bg-popover p-4 text-center text-sm text-destructive shadow-lg"
                >
                    {conflict.message}
                </div>
            )}
        </PlannerContext>
    );
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
    const item = { code: subject.code, name: subject.name, classroom };
    const selected = planner.items.some((entry) => classKey(entry) === classKey(item));

    return (
        <div className="px-3 pb-3">
            <Button
                variant={selected ? 'destructive' : 'default'}
                size="lg"
                className={cn(
                    'h-10 w-full rounded-xl',
                    !selected && 'bg-primary/15 text-primary hover:bg-primary/25'
                )}
                aria-pressed={selected}
                aria-label={`${selected ? 'Remover da' : 'Adicionar à'} grade: ${subject.code}, turma ${classroom.number}`}
                onClick={() => planner.toggle(item)}
            >
                {selected ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
                {selected ? 'Remover da grade' : 'Adicionar à grade'}
            </Button>
        </div>
    );
}

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function WeeklyTable({
    items,
    semester,
    action
}: {
    items: PlannedClass[];
    semester: string;
    action?: React.ReactNode;
}) {
    const entries = items.map((item) => ({
        ...item,
        times: parseSchedule(item.classroom.schedule)
    }));
    const times = entries.flatMap((entry) => entry.times);
    const rows = times.length
        ? SCHEDULE_SLOTS.filter(([start, end]) =>
              times.some((time) => start < time.end && end > time.start)
          )
        : [];
    const first = rows[0]?.[0];
    const last = rows.at(-1)?.[1];
    const visibleRows = SCHEDULE_SLOTS.filter(
        ([start, end]) => first && last && start >= first && end <= last
    );

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold">Semestre {semester}</h3>
                {action}
            </div>
            {visibleRows.length > 0 && (
                <section
                    className="overflow-x-auto rounded-lg border"
                    aria-label={`Grade semanal ${semester}`}
                >
                    <table className="w-full min-w-2xl table-fixed border-collapse text-center text-xs">
                        <caption className="sr-only">Grade semanal · {semester}.</caption>
                        <thead className="bg-primary text-primary-foreground">
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

export function SchedulePreview({ children }: { children?: React.ReactNode }) {
    const planner = useContext(PlannerContext);
    const [open, setOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState(false);
    if (!planner) return null;
    const { items, toggle } = planner;
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
            <div className={cn('flex', children && 'grid grid-cols-2 items-end gap-2')}>
                <div className="flex min-w-0 flex-col gap-2">
                    {children && (
                        <span className="text-xs text-muted-foreground">Grade semanal</span>
                    )}
                    <Button
                        variant="outline"
                        className={cn('justify-start self-start', children && 'h-8 w-full bg-card')}
                        render={<DialogTrigger />}
                        onClick={() => setOpen(true)}
                    >
                        <CalendarDays className="text-muted-foreground" aria-hidden="true" />
                        Mostrar grade
                    </Button>
                </div>
                {children}
            </div>
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
                                    <li
                                        key={classKey(item)}
                                        className="flex items-center gap-2 text-sm"
                                    >
                                        <span className="min-w-0 flex-1">
                                            {item.code} · {item.name} · T{item.classroom.number} ·{' '}
                                            {item.classroom.semester}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            aria-label={`Remover da grade: ${item.code}, turma ${item.classroom.number}`}
                                            onClick={() => toggle(item)}
                                        >
                                            <X aria-hidden="true" />
                                        </Button>
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
                    {exporting ? 'Gerando PNG...' : 'Baixar PNG'}
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
