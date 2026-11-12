import { CalendarDays, Download, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';

import { useDesktop } from '#/components/DesktopContext';
import { ClassCard } from '#/components/home/ClassCard';
import { usePlannedSchedule } from '#/components/schedule/usePlannedSchedule';
import { WeeklySchedule } from '#/components/schedule/WeeklySchedule';
import { WeeklyTable } from '#/components/schedule/WeeklyTable';
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
import { Progress } from '#/components/ui/progress';
import { saveFile } from '#/lib/download';
import { easeIn, spring } from '#/lib/motion';
import { classKey, weeklyGrid } from '#/lib/planned-schedule';
import { describeSchedule } from '#/lib/schedule';
import { createSchedulePng } from '#/lib/schedule-image';

export function SchedulePreview() {
    const desktop = useDesktop();
    const { items, maxHours, toggle, clear } = usePlannedSchedule();
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState(false);
    const grid = weeklyGrid(items);
    const download = async () => {
        setExporting(true);
        setExportError(false);
        try {
            saveFile(await createSchedulePng(grid), 'minha-grade-followw.png');
        } catch {
            setExportError(true);
        } finally {
            setExporting(false);
        }
    };

    const content = (
        <>
            {grid.map((semester) =>
                desktop ? (
                    <div key={semester.semester} className="flex flex-col gap-4">
                        <div className="flex items-center justify-between gap-3 text-sm">
                            <h3>Planejamento · {semester.semester}</h3>
                            <span className="text-muted-foreground tabular-nums">
                                {maxHours == null
                                    ? `${semester.hours}h`
                                    : `${semester.hours}h de ${maxHours}h`}
                            </span>
                        </div>
                        {maxHours != null && maxHours > 0 && (
                            <Progress
                                aria-label={`Carga horária de ${semester.semester}`}
                                value={Math.min(100, (semester.hours / maxHours) * 100)}
                                className="h-1"
                            />
                        )}
                        <WeeklySchedule
                            label={`Grade semanal ${semester.semester}`}
                            entries={semester.classes.map((entry) => ({
                                ...entry,
                                key: classKey(entry)
                            }))}
                        />
                    </div>
                ) : (
                    <WeeklyTable key={semester.semester} grid={semester} maxHours={maxHours} />
                )
            )}
            {items.length === 0 ? (
                <div className="flex min-h-56 flex-col items-center justify-center gap-3 py-8 text-center">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <CalendarDays aria-hidden="true" className="size-5" />
                    </span>
                    <h3 className="text-sm font-medium">Monte sua grade</h3>
                    <p className="max-w-56 text-xs leading-relaxed text-muted-foreground">
                        Abra uma matéria e use o botão + para adicionar uma turma.
                    </p>
                </div>
            ) : (
                <ul className="relative flex flex-col gap-2">
                    <AnimatePresence initial={false} mode="popLayout">
                        {items.map((item) => (
                            <m.li
                                key={classKey(item)}
                                layout
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{
                                    opacity: 0,
                                    scale: 0.96,
                                    transition: { duration: 0.15, ease: easeIn }
                                }}
                                transition={spring}
                            >
                                <ClassCard
                                    compact
                                    title={item.name}
                                    time={describeSchedule(item.schedule) ?? 'Horário a definir'}
                                    location={item.room ?? undefined}
                                    professors={item.professors.map(({ name }) => name)}
                                    action={
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            aria-label={`Remover da grade: ${item.code}, turma ${item.number}`}
                                            onClick={() => toggle(item)}
                                        >
                                            <X aria-hidden="true" />
                                        </Button>
                                    }
                                />
                            </m.li>
                        ))}
                    </AnimatePresence>
                </ul>
            )}
            {items.length > 0 && (
                <Button variant="outline" disabled={exporting} onClick={() => void download()}>
                    <Download aria-hidden="true" />
                    {exporting ? 'Gerando imagem...' : 'Baixar imagem'}
                </Button>
            )}
            {exportError && items.length > 0 && (
                <p role="alert" className="text-sm text-destructive">
                    Não foi possível baixar a grade. Tente novamente.
                </p>
            )}
        </>
    );

    if (desktop)
        return (
            <aside
                aria-label="Minha grade"
                className="schedule-panel flex min-w-0 flex-col gap-4 self-start lg:sticky lg:top-32 lg:border-l lg:pl-8"
            >
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-xl font-medium">
                        Minha grade{' '}
                        {items.length > 0 && (
                            <span className="ml-2 text-sm text-muted-foreground">
                                {items.length}
                            </span>
                        )}
                    </h2>
                    {items.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={clear}>
                            Limpar
                        </Button>
                    )}
                </div>
                <div className="schedule-content flex flex-col gap-5 overflow-y-auto overscroll-contain rounded-2xl border bg-card p-5 shadow-sm">
                    {content}
                </div>
            </aside>
        );

    return (
        <Dialog>
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
                >
                    <CalendarDays aria-hidden="true" />
                    Ver grade
                </Button>
            </SelectionBar>
            <DialogContent
                className="max-h-9/10 overflow-y-auto rounded-2xl sm:max-w-3xl"
                showCloseButton={false}
            >
                <DialogHeader className="flex-row items-center justify-between gap-3">
                    <DialogTitle>Minha grade semanal</DialogTitle>
                    <DialogClose
                        render={<Button variant="ghost" size="icon-sm" />}
                        aria-label="Fechar grade semanal"
                    >
                        <X aria-hidden="true" />
                    </DialogClose>
                </DialogHeader>
                {content}
            </DialogContent>
        </Dialog>
    );
}
