import { classKey, weeklyGrid } from '@followw/core/lib/planned-schedule.ts';
import { describeSchedule } from '@followw/core/lib/schedule.ts';
import { CalendarDays, Download, X } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { ClassCard } from '@/components/home/ClassCard';
import { ScheduleImageExport } from '@/components/schedule/ScheduleImage';
import { usePlannedSchedule } from '@/components/schedule/usePlannedSchedule';
import { WeeklyTable } from '@/components/schedule/WeeklyTable';
import { SelectionBar } from '@/components/SelectionBar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** Barra de turmas selecionadas e modal com a grade semanal; fica dentro de um container `relative flex-1`. */
export function SchedulePreview() {
    const { items, maxHours, toggle, clear } = usePlannedSchedule();
    const { width, height } = useWindowDimensions();
    const [open, setOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState(false);
    const grid = weeklyGrid(items);

    return (
        <>
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
                        className="rounded-full"
                        onPress={() => setOpen(true)}
                    >
                        <Icon as={CalendarDays} className="size-4 text-primary" />
                        <Text className="text-primary">Ver grade</Text>
                    </Button>
                </SelectionBar>
            )}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    className="max-w-lg p-4"
                    style={{ width: Math.min(width - 16, 512) }}
                >
                    <DialogHeader>
                        <DialogTitle className="text-left">Minha grade semanal</DialogTitle>
                    </DialogHeader>
                    <ScrollView
                        style={{ maxHeight: height * 0.7 }}
                        className="w-full"
                        contentContainerClassName="w-full gap-4"
                    >
                        {grid.map((semester) => (
                            <WeeklyTable
                                key={semester.semester}
                                grid={semester}
                                maxHours={maxHours}
                            />
                        ))}
                        {items.length === 0 ? (
                            <Text className="text-muted-foreground">
                                Adicione turmas nos resultados da busca para montar sua grade.
                            </Text>
                        ) : (
                            <View className="gap-2">
                                {items.map((item) => (
                                    <ClassCard
                                        key={classKey(item)}
                                        compact
                                        title={item.name}
                                        code={item.code}
                                        classNumber={item.number}
                                        time={
                                            describeSchedule(item.schedule) ?? 'Horário a definir'
                                        }
                                        location={item.room ?? undefined}
                                        professors={item.professors.map(({ name }) => name)}
                                        action={
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-8"
                                                aria-label={`Remover da grade: ${item.code}, turma ${item.number}`}
                                                onPress={() => toggle(item)}
                                            >
                                                <Icon as={X} className="size-4 text-destructive" />
                                            </Button>
                                        }
                                    />
                                ))}
                            </View>
                        )}
                        <Button
                            variant="outline"
                            disabled={items.length === 0 || exporting}
                            onPress={() => {
                                setExportError(false);
                                setExporting(true);
                            }}
                        >
                            <Icon as={Download} className="size-4" />
                            <Text>{exporting ? 'Gerando imagem...' : 'Compartilhar imagem'}</Text>
                        </Button>
                        {exportError && (
                            <Text role="alert" className="text-sm text-destructive">
                                Não foi possível gerar a grade. Tente novamente.
                            </Text>
                        )}
                    </ScrollView>
                </DialogContent>
            </Dialog>
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
        </>
    );
}
