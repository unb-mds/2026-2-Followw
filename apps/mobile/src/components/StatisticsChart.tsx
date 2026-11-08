import type { components } from '@followw/core/queries/schema.gen.ts';

import { View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';

import { Text } from '@/components/ui/text';
import { useColor } from '@/lib/colors';

type Situation = components['schemas']['StatisticsShare']['situation'];

const situations: Record<Situation, { label: string }> = {
    aprovado: { label: 'Aprovado' },
    reprovado: { label: 'Reprovado' },
    reprovado_por_faltas: { label: 'Reprovado por faltas' },
    reprovado_por_media_e_por_faltas: {
        label: 'Reprovado por média e faltas'
    },
    aprovado_por_nota: { label: 'Aprovado por nota' },
    reprovado_por_nota: { label: 'Reprovado por nota' },
    reprovado_por_nota_e_faltas: { label: 'Reprovado por nota e faltas' },
    trancado: { label: 'Trancado' },
    matriculado: { label: 'Matriculado' }
};

const percentage = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function useSituationColors(): Record<Situation, string> {
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

export function StatisticsChart({
    data,
    label
}: {
    data: components['schemas']['StatisticsShare'][];
    label: string;
}) {
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
                            {situations[share.situation].label}
                        </Text>
                        <Text className="text-xs font-medium text-foreground">
                            {percentage.format(share.percentage)}%
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}
