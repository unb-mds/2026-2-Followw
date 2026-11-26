import type {
    StatisticsShare,
    StatisticsSituation
} from '@followw/core/queries/subject-statistics.ts';

import { shareLabel, situationLabels } from '@followw/core/queries/subject-statistics.ts';
import { View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';

import { Text } from '@/components/ui/text';
import { useColor } from '@/lib/colors';

function useSituationColors(): Record<StatisticsSituation, string> {
    const success = useColor('success');
    const destructive = useColor('destructive');
    const warning = useColor('warning');
    const primary = useColor('primary');
    const muted = useColor('muted-foreground');
    return {
        aprovado: success,
        reprovado: destructive,
        reprovado_por_faltas: warning,
        reprovado_por_media_e_por_faltas: '#f43f5e',
        aprovado_por_nota: primary,
        reprovado_por_nota: '#b91c1c',
        reprovado_por_nota_e_faltas: '#a855f7',
        trancado: muted,
        matriculado: '#3b82f6'
    };
}

export function StatisticsChart({ data, label }: { data: StatisticsShare[]; label: string }) {
    const colors = useSituationColors();
    const background = useColor('card');
    const shares = data
        .filter((share) => share.percentage > 0)
        .map((share) => ({
            situation: share.situation,
            percentage: share.percentage,
            color: colors[share.situation]
        }));

    return (
        <View className="gap-3" accessibilityLabel={label}>
            <View className="items-center py-1">
                <PieChart
                    data={shares.map((share) => ({ value: share.percentage, color: share.color }))}
                    donut
                    radius={89}
                    innerRadius={79}
                    innerCircleColor={background}
                    strokeWidth={shares.length > 1 ? 4 : 0}
                    strokeColor={background}
                    isAnimated={false}
                />
            </View>
            <View className="gap-2">
                {shares.map((share) => (
                    <View key={share.situation} className="flex-row items-center gap-2">
                        <View
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: share.color }}
                        />
                        <Text className="flex-1 text-xs text-foreground">
                            {situationLabels[share.situation]}
                        </Text>
                        <Text className="text-xs font-medium text-foreground">
                            {shareLabel(share.percentage)}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}
