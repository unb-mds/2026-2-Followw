import { visibleGridDays } from '@followw/core/lib/planned-schedule.ts';
import { parseSchedule } from '@followw/core/lib/schedule.ts';
import {
    dayLanes,
    formatMinutes,
    timePosition,
    timelineHeight,
    timeTicks,
    weeklyTimeline
} from '@followw/core/lib/weekly-timeline.ts';
import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const TIMELINE_INSET = 16;
const BLOCK_GAP = 3;
const HOUR_COLUMN = 52;
// mesma largura mínima e altura máxima da grade do web (min-w-md, max-h-144)
const MIN_WIDTH = 448;
const MAX_HEIGHT = 576;

export interface WeeklyEntry {
    key: string;
    code: string;
    name: string;
    number: string;
    schedule?: string | null;
}

export function WeeklySchedule({
    entries,
    label,
    onSelect
}: {
    entries: WeeklyEntry[];
    label: string;
    onSelect?: (key: string) => void;
}) {
    const times = useMemo(
        () =>
            entries.flatMap((entry) =>
                parseSchedule(entry.schedule).map((time) => Object.assign(time, { entry }))
            ),
        [entries]
    );
    const days = visibleGridDays(times);
    const range = weeklyTimeline(times);
    const ticks = timeTicks(range);

    return (
        <View accessibilityLabel={label} className="min-w-0">
            {range && (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="rounded-xl border border-border"
                    contentContainerStyle={{ minWidth: MIN_WIDTH, flexGrow: 1 }}
                >
                    <View className="flex-1">
                        <View className="flex-row border-b border-foreground/10 bg-muted">
                            <Text
                                style={{ width: HOUR_COLUMN }}
                                className="py-3 pr-3 text-right text-xs text-muted-foreground"
                            >
                                Hora
                            </Text>
                            {days.map(({ label: day }) => (
                                <Text
                                    key={day}
                                    className="flex-1 py-3 text-center text-xs font-semibold text-foreground"
                                >
                                    {day}
                                </Text>
                            ))}
                        </View>
                        <ScrollView nestedScrollEnabled style={{ maxHeight: MAX_HEIGHT }}>
                            <View
                                className="flex-row"
                                style={{ height: timelineHeight(range) + TIMELINE_INSET * 2 }}
                            >
                                <View
                                    style={{ width: HOUR_COLUMN }}
                                    className="border-r border-foreground/10 bg-muted/50"
                                >
                                    {ticks.map(({ minute, top }) => (
                                        <Text
                                            key={minute}
                                            className="absolute right-3 text-xs font-medium text-muted-foreground"
                                            style={{ top: top + TIMELINE_INSET - 8 }}
                                        >
                                            {formatMinutes(minute)}
                                        </Text>
                                    ))}
                                </View>
                                {days.map(({ weekday, label: day }) => (
                                    <View key={weekday} className="relative flex-1">
                                        {dayLanes(
                                            times.filter((time) => time.weekday === weekday)
                                        ).map(({ entry, start, end, lane, lanes }) => {
                                            const top = timePosition(start, range);
                                            const style = {
                                                top: top + TIMELINE_INSET + BLOCK_GAP,
                                                height: Math.max(
                                                    16,
                                                    timePosition(end, range) - top - BLOCK_GAP * 2
                                                ),
                                                left: `${(lane / lanes) * 100}%` as const,
                                                width: `${100 / lanes}%` as const,
                                                paddingHorizontal: BLOCK_GAP
                                            };
                                            const description = `${day}, ${start}–${end}: ${entry.name}, ${entry.code}, turma ${entry.number}`;
                                            return (
                                                <Pressable
                                                    key={`${entry.key}-${start}`}
                                                    disabled={!onSelect}
                                                    accessibilityRole={
                                                        onSelect ? 'button' : undefined
                                                    }
                                                    accessibilityLabel={description}
                                                    style={style}
                                                    className="absolute"
                                                    onPress={() => onSelect?.(entry.key)}
                                                >
                                                    <View
                                                        className={cn(
                                                            'flex-1 justify-center gap-0.5 overflow-hidden rounded-lg border border-primary/50 bg-primary/10 px-1 py-2',
                                                            onSelect && 'active:bg-primary/20'
                                                        )}
                                                    >
                                                        <Text
                                                            numberOfLines={1}
                                                            className="text-center text-xs font-semibold text-primary"
                                                        >
                                                            {entry.code}
                                                        </Text>
                                                        <Text
                                                            numberOfLines={1}
                                                            className="text-center text-xs text-foreground/70"
                                                        >
                                                            T{entry.number}
                                                        </Text>
                                                    </View>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                ))}
                            </View>
                        </ScrollView>
                    </View>
                </ScrollView>
            )}
            {entries
                .filter((entry) => parseSchedule(entry.schedule).length === 0)
                .map((entry) => (
                    <Text key={entry.key} className="mt-3 text-sm text-muted-foreground">
                        {entry.code} · T{entry.number}: horário a definir.
                    </Text>
                ))}
        </View>
    );
}
