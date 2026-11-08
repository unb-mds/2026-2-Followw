import type { GridSemester } from '@followw/core/lib/planned-schedule.ts';

import { classKey, GRID_DAYS } from '@followw/core/lib/planned-schedule.ts';
import { ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const TIME_WIDTH = 84;
const DAY_WIDTH = 68;

interface WeeklyTableProps {
    grid: GridSemester;
    maxHours: number | null;
    // colunas flexíveis, sem rolagem (imagem exportada)
    fill?: boolean;
}

export function WeeklyTable({
    grid: { semester, hours, rows, unscheduled },
    maxHours,
    fill
}: WeeklyTableProps) {
    const column = (width: number) => (fill ? { flex: 1 } : { width });
    const table = (
        <View className="overflow-hidden rounded-lg border border-border">
            <View className="flex-row bg-foreground dark:bg-background">
                <Text
                    style={{ width: TIME_WIDTH }}
                    className="p-2 text-center text-xs font-bold text-background dark:text-foreground"
                >
                    Horários
                </Text>
                {GRID_DAYS.map(({ label }) => (
                    <Text
                        key={label}
                        style={column(DAY_WIDTH)}
                        className="p-2 text-center text-xs font-bold text-background dark:text-foreground"
                    >
                        {label}
                    </Text>
                ))}
            </View>
            {rows.map(({ start, end, cells }) => (
                <View key={start} className="flex-row border-t border-border">
                    <View style={{ width: TIME_WIDTH }} className="justify-center bg-muted p-2">
                        <Text className="text-center text-xs font-medium">
                            {start}–{end}
                        </Text>
                    </View>
                    {cells.map((entry, index) => (
                        <View
                            key={GRID_DAYS[index].label}
                            style={column(DAY_WIDTH)}
                            className={cn(
                                'items-center justify-center border-l border-border p-2',
                                entry && 'bg-primary/5'
                            )}
                        >
                            {entry ? (
                                <>
                                    <Text className="text-xs font-semibold text-primary">
                                        {entry.code}
                                    </Text>
                                    <Text className="text-xs text-primary">T{entry.number}</Text>
                                </>
                            ) : (
                                <Text className="text-xs text-muted-foreground">—</Text>
                            )}
                        </View>
                    ))}
                </View>
            ))}
        </View>
    );

    return (
        <View className="w-full min-w-0 gap-2">
            <View>
                <Text className="text-base font-semibold">Semestre {semester}</Text>
                <Text
                    className={cn(
                        'text-xs text-muted-foreground',
                        maxHours != null && hours > maxHours && 'text-destructive'
                    )}
                >
                    {maxHours == null ? `${hours}h` : `${hours}h de ${maxHours}h`}
                </Text>
            </View>
            {rows.length > 0 &&
                (fill ? (
                    table
                ) : (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        className="w-full"
                    >
                        {table}
                    </ScrollView>
                ))}
            {unscheduled.map((entry) => (
                <Text key={classKey(entry)} className="text-sm text-muted-foreground">
                    {entry.code} · T{entry.number}: horário a definir.
                </Text>
            ))}
        </View>
    );
}
