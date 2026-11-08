import type { GridSemester } from '@followw/core/lib/planned-schedule.ts';

import { classKey } from '@followw/core/lib/planned-schedule.ts';
import { describeSchedule } from '@followw/core/lib/schedule.ts';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { WeeklyTable } from '@/components/schedule/WeeklyTable';
import { Text } from '@/components/ui/text';

const IMAGE_WIDTH = 600;

function Snapshot({ grid, maxHours }: { grid: GridSemester[]; maxHours: number | null }) {
    return (
        <View style={{ width: IMAGE_WIDTH }} className="gap-8 bg-background p-6">
            {grid.map((semester) => (
                <View key={semester.semester} className="gap-4">
                    <Text className="text-2xl font-bold">Minha grade · {semester.semester}</Text>
                    <WeeklyTable grid={semester} maxHours={maxHours} fill />
                    <View className="gap-2">
                        {semester.classes.map((item) => (
                            <View
                                key={classKey(item)}
                                className="gap-0.5 rounded-xl border border-border bg-card p-3"
                            >
                                <View className="flex-row justify-between gap-2">
                                    <Text className="flex-1 text-xs font-semibold text-primary">
                                        {describeSchedule(item.schedule) ?? 'Horário a definir'}
                                    </Text>
                                    <Text className="text-xs font-medium text-muted-foreground">
                                        {item.code} · T{item.number}
                                    </Text>
                                </View>
                                <Text className="text-sm font-semibold">{item.name}</Text>
                                <Text className="text-xs text-muted-foreground">
                                    {[item.room, item.professors.map(({ name }) => name).join(', ')]
                                        .filter(Boolean)
                                        .join(' · ')}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>
            ))}
            <Text className="text-center text-xs font-medium text-muted-foreground">
                followw.app
            </Text>
        </View>
    );
}

/** Renderiza a grade fora da tela, captura como PNG e abre o share sheet. */
export function ScheduleImageExport({
    grid,
    maxHours,
    onDone
}: {
    grid: GridSemester[];
    maxHours: number | null;
    // `failed` quando não foi possível gerar ou compartilhar
    onDone: (failed: boolean) => void;
}) {
    const ref = useRef<React.ComponentRef<typeof View>>(null);
    useEffect(() => {
        let active = true;
        const timer = setTimeout(async () => {
            let failed = false;
            try {
                const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
                if (!(await Sharing.isAvailableAsync())) throw new Error('indisponível');
                await Sharing.shareAsync(uri.startsWith('file:') ? uri : `file://${uri}`, {
                    mimeType: 'image/png',
                    UTI: 'public.png',
                    dialogTitle: 'Minha grade'
                });
            } catch {
                failed = true;
            }
            if (active) onDone(failed);
        }, 150);
        return () => {
            active = false;
            clearTimeout(timer);
        };
        // dispara uma vez por exportação
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <View
            ref={ref}
            collapsable={false}
            pointerEvents="none"
            style={{ position: 'absolute', left: -IMAGE_WIDTH * 2, top: 0 }}
        >
            <Snapshot grid={grid} maxHours={maxHours} />
        </View>
    );
}
