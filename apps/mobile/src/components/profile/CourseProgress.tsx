import type { Classroom } from '@followw/core/queries/classrooms.ts';
import type { UserProfile } from '@followw/core/queries/me.ts';

import {
    categoryForecast,
    categoryGain,
    hoursLabel,
    percentLabel,
    percentOf,
    progressSummary,
    type WorkloadCategory
} from '@followw/core/lib/profile.ts';
import { useEffect } from 'react';
import { View } from 'react-native';
import {
    createAnimatedComponent,
    useAnimatedProps,
    useSharedValue,
    withTiming
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { AnimatedNumber } from '@/components/AnimatedNumber';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useColor } from '@/lib/colors';
import { ease } from '@/lib/motion';
import { cn } from '@/lib/utils';

const NO_CLASSROOMS: readonly Classroom[] = [];
const RING_LENGTH = 2 * Math.PI * 44;
const AnimatedCircle = createAnimatedComponent(Circle);

/** Arco do anel que se desenha a partir do zero, no mesmo tempo da contagem. */
function RingArc({ percent, color }: { percent: number; color: string }) {
    const drawn = useSharedValue(0);
    useEffect(() => {
        drawn.value = withTiming(percent, { duration: 600, easing: ease });
    }, [drawn, percent]);
    const props = useAnimatedProps(() => ({
        strokeDasharray: [(drawn.value / 100) * RING_LENGTH, RING_LENGTH]
    }));
    return (
        <AnimatedCircle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            animatedProps={props}
        />
    );
}

export function CourseProgress({
    user,
    classrooms = NO_CLASSROOMS
}: {
    user: UserProfile;
    classrooms?: readonly Classroom[];
}) {
    const {
        integralization,
        workload,
        progress,
        projected,
        categories,
        showForecast,
        percentGain,
        hoursGain
    } = progressSummary(user, classrooms);

    return (
        <Card size="sm" className="gap-0 px-4 py-3">
            {(integralization != null || progress) && (
                <View className={cn(categories && 'border-b border-border pb-3')}>
                    {(integralization != null || showForecast) && (
                        <View className="mb-4 flex-row flex-wrap items-center gap-x-4 gap-y-1">
                            <View className="flex-row items-center gap-2">
                                <View className="h-1 w-5 rounded-full bg-primary" />
                                <Text className="text-xs text-muted-foreground">Concluído</Text>
                            </View>
                            {showForecast && (
                                <View className="flex-row items-center gap-2">
                                    <View className="h-1 w-5 rounded-full bg-forecast" />
                                    <Text className="text-xs font-medium text-forecast-foreground">
                                        Em andamento
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}
                    <View className="flex-row flex-wrap items-center gap-4">
                        {integralization != null && (
                            <IntegralizationRing
                                value={integralization}
                                projected={projected}
                                gain={percentGain}
                            />
                        )}
                        {progress ? (
                            <View className="min-w-0 shrink">
                                <Text className="text-2xl font-medium tracking-tight">
                                    {hoursLabel(progress.completed)}
                                    {hoursGain > 0 && (
                                        <Text className="text-base text-forecast-foreground">
                                            {`  +${hoursLabel(hoursGain)}`}
                                        </Text>
                                    )}
                                </Text>
                                <Text className="text-sm text-muted-foreground">
                                    de {hoursLabel(progress.total)} concluídas
                                </Text>
                            </View>
                        ) : (
                            <Text className="text-sm text-muted-foreground">
                                Integralização do curso
                            </Text>
                        )}
                    </View>
                </View>
            )}
            {categories && (
                <View className="gap-3 pt-3">
                    {categories.map((category) => (
                        <CategoryProgress key={category.label} {...category} />
                    ))}
                    {!progress && workload && (
                        <CategoryRow
                            label="Total do currículo"
                            value={hoursLabel(workload.total)}
                        />
                    )}
                </View>
            )}
        </Card>
    );
}

function IntegralizationRing({
    value,
    projected,
    gain
}: {
    value: number;
    projected: number | null;
    gain: number | null;
}) {
    const muted = useColor('muted');
    const primary = useColor('primary');
    const forecast = useColor('forecast');
    return (
        <View
            accessible
            accessibilityLabel={`Integralização do curso: ${value.toLocaleString('pt-BR')}%${projected != null ? '. Em andamento: avanço com as disciplinas do semestre atual.' : ''}`}
            className="size-20 shrink-0 items-center justify-center"
        >
            <Svg
                viewBox="0 0 100 100"
                width="100%"
                height="100%"
                style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
            >
                <Circle cx="50" cy="50" r="44" fill="none" stroke={muted} strokeWidth="8" />
                {projected != null && <RingArc percent={projected} color={forecast} />}
                {value > 0 && <RingArc percent={Math.min(100, value)} color={primary} />}
            </Svg>
            <Text className="text-xl leading-tight font-medium">
                <AnimatedNumber
                    value={value}
                    className="text-xl leading-tight font-medium"
                    // inteiro durante a contagem, exato ao final
                    format={(shown) =>
                        (shown === value ? shown : Math.round(shown)).toLocaleString('pt-BR')
                    }
                />
                %
            </Text>
            {gain != null && gain > 0 && (
                <Text className="text-xs leading-tight font-medium text-forecast-foreground">
                    +{percentLabel(gain)}
                </Text>
            )}
        </View>
    );
}

function CategoryProgress(category: WorkloadCategory) {
    const { label, pending, required } = category;
    // sem a matriz, mostra só o que falta
    if (required == null)
        return <CategoryRow label={label} value={`${hoursLabel(pending)} pendentes`} />;
    if (required === 0) return <CategoryRow label={label} value="Não exigido" muted />;

    const completed = Math.max(0, required - pending);
    const forecast = categoryForecast(category);
    return (
        <View className="gap-1">
            <CategoryRow
                label={label}
                value={
                    <>
                        {hoursLabel(completed)}
                        {forecast != null && (
                            <Text className="text-sm font-medium text-forecast-foreground">
                                {` +${hoursLabel(categoryGain(category))}`}
                            </Text>
                        )}
                        {` / ${hoursLabel(required)}`}
                    </>
                }
            />
            <View className="relative h-2 overflow-hidden rounded-full bg-muted">
                {forecast != null && (
                    <View
                        className="absolute inset-y-0 left-0 rounded-full bg-forecast"
                        style={{ width: `${forecast}%` }}
                    />
                )}
                <View
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${percentOf(completed, required)}%` }}
                />
            </View>
        </View>
    );
}

function CategoryRow({
    label,
    value,
    muted
}: {
    label: string;
    value: React.ReactNode;
    muted?: boolean;
}) {
    return (
        <View className="flex-row items-baseline justify-between gap-4">
            <Text className="text-sm text-muted-foreground">{label}</Text>
            <Text className={cn('text-sm', muted ? 'text-muted-foreground' : 'font-medium')}>
                {value}
            </Text>
        </View>
    );
}
