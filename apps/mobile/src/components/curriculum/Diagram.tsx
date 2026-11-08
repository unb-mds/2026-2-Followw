import type {
    AcademicState,
    CurriculumModel,
    FlowSubject
} from '@followw/core/lib/curriculum/types.ts';

import { layoutCurriculum, MOBILE } from '@followw/core/lib/curriculum/geometry.ts';
import { relatedEdgeIds } from '@followw/core/lib/curriculum/relations.ts';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { Connections } from '@/components/curriculum/Connections';
import { SubjectCard } from '@/components/curriculum/SubjectCard';
import { SubjectDetails } from '@/components/curriculum/SubjectDetails';
import { openSearch } from '@/components/search/SubjectSearchLink';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export interface DiagramProps {
    model: CurriculumModel;
    selected?: string;
    // ausente fora do curso do aluno
    state?: (subject: FlowSubject) => AcademicState;
    initialPeriod: number;
    // conteúdo que rola junto, acima do diagrama
    header?: React.ReactNode;
    refreshControl?: React.ReactElement<object>;
}

/** Fluxo paginado por semestre: o seletor fica fixo e o diagrama rola nos dois eixos. */
export function Diagram({
    model,
    selected,
    state,
    initialPeriod,
    header,
    refreshControl
}: DiagramProps) {
    const router = useRouter();
    const { width, height } = useWindowDimensions();
    const { periods, byCode } = model;
    const geometry = useMemo(() => layoutCurriculum(model, width, MOBILE), [model, width]);
    const [index, setIndex] = useState(() =>
        Math.max(0, periods.indexOf(byCode.get(selected ?? '')?.period ?? initialPeriod))
    );
    const [active, setActive] = useState<string | null>(null);
    const [details, setDetails] = useState<FlowSubject | null>(null);
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
        <View className="flex-1 bg-background">
            <View className="px-4 pt-2 pb-2">
                <View className="flex-row items-center justify-between gap-4 rounded-xl bg-muted/60 p-1">
                    <Button
                        variant="outline"
                        size="icon"
                        className="size-9"
                        aria-label="Semestre anterior"
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
                        aria-label="Próximo semestre"
                        disabled={index === periods.length - 1}
                        onPress={() => goTo(Math.min(periods.length - 1, index + 1))}
                    >
                        <Icon as={ChevronRight} />
                    </Button>
                </View>
            </View>
            <ScrollView
                ref={vertical}
                contentInsetAdjustmentBehavior="automatic"
                refreshControl={refreshControl}
                contentContainerClassName="gap-4 pb-8"
            >
                <View className="gap-3 px-4">{header}</View>
                <ScrollView
                    ref={horizontal}
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
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
                                selected={
                                    selected === node.subject.code || active === node.subject.code
                                }
                                compact={MOBILE.compact}
                                onPress={() => setDetails(node.subject)}
                                onLongPress={() =>
                                    setActive(
                                        active === node.subject.code ? null : node.subject.code
                                    )
                                }
                            />
                        ))}
                    </View>
                </ScrollView>
            </ScrollView>
            <Dialog open={details !== null} onOpenChange={(open) => !open && setDetails(null)}>
                <DialogContent
                    className="max-w-lg p-4"
                    style={{ width: Math.min(width - 16, 512) }}
                >
                    {details && (
                        <ScrollView style={{ maxHeight: height * 0.75 }}>
                            <SubjectDetails
                                subject={details}
                                state={state?.(details)}
                                unlocks={model.unlocks.get(details.code)}
                                onShowClassrooms={() => {
                                    setDetails(null);
                                    openSearch(router, details.code, 'classrooms');
                                }}
                            />
                        </ScrollView>
                    )}
                </DialogContent>
            </Dialog>
        </View>
    );
}
