import { classKey, weeklyGrid } from '@followw/core/lib/planned-schedule.ts';
import { describeSchedule } from '@followw/core/lib/schedule.ts';
import { CalendarDays, Download, X } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { ClassCard } from '@/components/home/ClassCard';
import { ScheduleImageExport } from '@/components/schedule/ScheduleImage';
import { usePlannedSchedule } from '@/components/schedule/usePlannedSchedule';
import { WeeklySchedule } from '@/components/schedule/WeeklySchedule';
import { SelectionBar } from '@/components/SelectionBar';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** Barra flutuante acima da navegação inferior; renderize dentro de um container `relative flex-1`. */
export function SchedulePreview() {
    const { items, maxHours, toggle, clear } = usePlannedSchedule();
    const { height } = useWindowDimensions();
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState(false);
    const grid = weeklyGrid(items);

    return (
        <Dialog>
            {items.length > 0 && (
                <SelectionBar
                    label="Turmas selecionadas"
                    count={items.length}
                    units={['turma', 'turmas']}
                    onClear={clear}
                >
                    <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="rounded-full">
                            <Icon as={CalendarDays} className="size-4 text-primary" />
                            <Text className="text-primary">Ver grade</Text>
                        </Button>
                    </DialogTrigger>
                </SelectionBar>
            )}
            <DialogContent className="max-w-3xl rounded-2xl" showCloseButton={false}>
                <DialogHeader className="flex-row items-center justify-between gap-3">
                    <DialogTitle>Minha grade semanal</DialogTitle>
                    <DialogClose asChild>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            accessibilityLabel="Fechar grade semanal"
                        >
                            <Icon as={X} className="size-4" />
                        </Button>
                    </DialogClose>
                </DialogHeader>
                <ScrollView
                    style={{ maxHeight: height * 0.7 }}
                    className="w-full"
                    contentContainerClassName="w-full gap-4"
                >
                    {grid.map((semester) => (
                        <View key={semester.semester} className="gap-4">
                            <View className="flex-row items-center justify-between gap-3">
                                <Text role="heading" aria-level={3} className="text-sm">
                                    Planejamento · {semester.semester}
                                </Text>
                                <Text
                                    className={cn(
                                        'text-sm text-muted-foreground',
                                        maxHours != null &&
                                            semester.hours > maxHours &&
                                            'text-destructive'
                                    )}
                                >
                                    {maxHours == null
                                        ? `${semester.hours}h`
                                        : `${semester.hours}h de ${maxHours}h`}
                                </Text>
                            </View>
                            {maxHours != null && maxHours > 0 && (
                                <Progress
                                    accessibilityLabel={`Carga horária de ${semester.semester}`}
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
                        </View>
                    ))}
                    {items.length === 0 ? (
                        <View className="min-h-56 items-center justify-center gap-3 py-8">
                            <View className="size-10 items-center justify-center rounded-xl bg-primary/10">
                                <Icon as={CalendarDays} className="size-5 text-primary" />
                            </View>
                            <Text className="text-sm font-medium">Monte sua grade</Text>
                            <Text className="max-w-56 text-center text-xs leading-relaxed text-muted-foreground">
                                Abra uma matéria e use o botão + para adicionar uma turma.
                            </Text>
                        </View>
                    ) : (
                        <View className="gap-2">
                            {items.map((item) => (
                                <ClassCard
                                    key={classKey(item)}
                                    compact
                                    variant="planned"
                                    code={item.code}
                                    title={item.name}
                                    time={describeSchedule(item.schedule) ?? 'Horário a definir'}
                                    location={item.room ?? undefined}
                                    professors={item.professors.map(({ name }) => name)}
                                    action={
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            accessibilityLabel={`Remover da grade: ${item.code}, turma ${item.number}`}
                                            onPress={() => toggle(item)}
                                        >
                                            <Icon as={X} className="size-4 text-destructive" />
                                        </Button>
                                    }
                                />
                            ))}
                        </View>
                    )}
                    {items.length > 0 && (
                        <Button
                            variant="outline"
                            disabled={exporting}
                            onPress={() => {
                                setExportError(false);
                                setExporting(true);
                            }}
                        >
                            <Icon as={Download} className="size-4" />
                            <Text>{exporting ? 'Gerando imagem...' : 'Baixar imagem'}</Text>
                        </Button>
                    )}
                    {exportError && items.length > 0 && (
                        <Text role="alert" className="text-sm text-destructive">
                            Não foi possível baixar a grade. Tente novamente.
                        </Text>
                    )}
                </ScrollView>
            </DialogContent>
            {exporting && (
                <ScheduleImageExport
                    grid={grid}
                    maxHours={maxHours}
                    onDone={(failed) => {
                        setExporting(false);
                        setExportError(failed);
                    }}
                />
            )}
        </Dialog>
    );
}
