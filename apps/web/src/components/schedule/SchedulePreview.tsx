import { CalendarDays, Download, X } from 'lucide-react';
import { useState } from 'react';

import { ClassCard } from '#/components/home/ClassCard';
import { usePlannedSchedule } from '#/components/schedule/usePlannedSchedule';
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
import { saveFile } from '#/lib/download';
import { classKey, weeklyGrid } from '#/lib/planned-schedule';
import { describeSchedule } from '#/lib/schedule';
import { createSchedulePng } from '#/lib/schedule-image';

export function SchedulePreview() {
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

    return (
        <Dialog>
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
                <DialogHeader className="flex-row items-center justify-between gap-3">
                    <DialogTitle>Minha grade semanal</DialogTitle>
                    <DialogClose
                        render={<Button variant="ghost" size="icon-sm" />}
                        aria-label="Fechar grade semanal"
                    >
                        <X aria-hidden="true" />
                    </DialogClose>
                </DialogHeader>
                {grid.map((semester) => (
                    <WeeklyTable key={semester.semester} grid={semester} maxHours={maxHours} />
                ))}
                {items.length === 0 ? (
                    <p className="text-muted-foreground">
                        Adicione turmas nos resultados da busca para montar sua grade.
                    </p>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {items.map((item) => (
                            <li key={classKey(item)}>
                                <ClassCard
                                    compact
                                    title={item.name}
                                    code={item.code}
                                    classNumber={item.number}
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
                            </li>
                        ))}
                    </ul>
                )}
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
