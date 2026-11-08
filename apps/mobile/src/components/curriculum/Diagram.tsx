import type {
    AcademicState,
    CurriculumModel,
    FlowSubject
} from '@followw/core/lib/curriculum/types.ts';

import { layoutCurriculum, MOBILE } from '@followw/core/lib/curriculum/geometry.ts';
import { relatedEdgeIds } from '@followw/core/lib/curriculum/relations.ts';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Connections } from '@/components/curriculum/Connections';
import { SubjectCard } from '@/components/curriculum/SubjectCard';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export interface DiagramProps {
    model: CurriculumModel;
    selected?: string;
    // ausente fora do curso do aluno
    state?: (subject: FlowSubject) => AcademicState;
    initialPeriod: number;
    // header da página e avisos, que rolam acima do seletor de semestre
    header?: React.ReactNode;
    notices?: React.ReactNode;
    refreshControl?: React.ReactElement<object>;
}

/** Fluxo paginado por semestre: a página rola na vertical com o seletor fixo e o diagrama na horizontal. */
export function Diagram({
    model,
    selected,
    state,
    initialPeriod,
    header,
    notices,
    refreshControl
}: DiagramProps) {
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const { periods, byCode } = model;
    const geometry = useMemo(() => layoutCurriculum(model, width, MOBILE), [model, width]);
    const [index, setIndex] = useState(() =>
        Math.max(0, periods.indexOf(byCode.get(selected ?? '')?.period ?? initialPeriod))
    );
    const [active, setActive] = useState<string | null>(null);
    const visibleEdges = useMemo(
        () => (active ? relatedEdgeIds(model.edges, active) : null),
        [model, active]
    );
    const horizontal = useRef<React.ComponentRef<typeof ScrollView>>(null);
    const vertical = useRef<React.ComponentRef<typeof ScrollView>>(null);
    const canvasTop = useRef(0);

    const offsets = useMemo(
        () =>
            geometry.columns.map(({ x }) =>
                Math.max(0, Math.min(geometry.width - width, x - width / 2))
            ),
        [geometry, width]
    );
    const goTo = (next: number, animated = true) => {
        setIndex(next);
        horizontal.current?.scrollTo({ x: offsets[next], animated });
    };

    // posição inicial e, se houver matéria selecionada, a rolagem até ela
    const revealed = useRef(false);
    useEffect(() => {
        if (revealed.current) return undefined;
        revealed.current = true;
        const timer = setTimeout(() => {
            horizontal.current?.scrollTo({ x: offsets[index], animated: false });
            const node = geometry.nodes.find((item) => item.subject.code === selected);
            if (node)
                vertical.current?.scrollTo({
                    y: Math.max(0, canvasTop.current + node.y - height / 3),
                    animated: false
                });
        }, 50);
        return () => clearTimeout(timer);
    }, [geometry, height, index, offsets, selected]);

    const period = periods[index];
    return (
        <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
            <ScrollView
                ref={vertical}
                refreshControl={refreshControl}
                // índice do seletor de semestre
                stickyHeaderIndices={[2]}
                contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            >
                <View className="w-full max-w-2xl self-center px-4">
                    {header}
                    <OfflineBanner />
                </View>
                <View className={cn('w-full max-w-2xl gap-2 self-center px-4', notices && 'pb-3')}>
                    {notices}
                </View>
                <View className="bg-background px-4 pt-2 pb-2">
                    <View className="w-full max-w-2xl flex-row items-center justify-between gap-4 self-center rounded-xl bg-muted/60 p-1">
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-9"
                            accessibilityLabel="Semestre anterior"
                            disabled={index === 0}
                            onPress={() => goTo(Math.max(0, index - 1))}
                        >
                            <Icon as={ChevronLeft} />
                        </Button>
                        <Text
                            role="heading"
                            aria-level={2}
                            aria-live="polite"
                            className="text-base font-semibold"
                        >
                            {period}º semestre
                        </Text>
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-9"
                            accessibilityLabel="Próximo semestre"
                            disabled={index === periods.length - 1}
                            onPress={() => goTo(Math.min(periods.length - 1, index + 1))}
                        >
                            <Icon as={ChevronRight} />
                        </Button>
                    </View>
                </View>
                <ScrollView
                    ref={horizontal}
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
                    accessibilityLabel="Fluxo acadêmico, um semestre por vez"
                    snapToOffsets={offsets}
                    decelerationRate="fast"
                    onLayout={(event) => {
                        canvasTop.current = event.nativeEvent.layout.y;
                    }}
                    onMomentumScrollEnd={(event) => {
                        const center = event.nativeEvent.contentOffset.x + width / 2;
                        const distances = geometry.columns.map(({ x }) => Math.abs(x - center));
                        setIndex(distances.indexOf(Math.min(...distances)));
                    }}
                >
                    <View style={{ width: geometry.width, height: geometry.height }}>
                        <Connections
                            model={model}
                            geometry={geometry}
                            visibleEdges={visibleEdges}
                        />
                        {geometry.nodes.map((node) => (
                            <SubjectCard
                                key={node.subject.code}
                                node={node}
                                state={state?.(node.subject)}
                                unlocks={model.unlocks.get(node.subject.code)}
                                selected={
                                    selected === node.subject.code || active === node.subject.code
                                }
                                compact={MOBILE.compact}
                                onHighlight={(code) => setActive(active === code ? null : code)}
                            />
                        ))}
                    </View>
                </ScrollView>
            </ScrollView>
        </View>
    );
}
