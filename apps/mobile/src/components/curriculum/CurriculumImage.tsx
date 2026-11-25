import type {
    AcademicState,
    CurriculumModel,
    FlowSubject
} from '@followw/core/lib/curriculum/types.ts';

import { creditText, hoursText } from '@followw/core/lib/curriculum/format.ts';
import { layoutCurriculum } from '@followw/core/lib/curriculum/geometry.ts';
import { titleCase } from '@followw/core/lib/profile.ts';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Connections } from '@/components/curriculum/Connections';
import { ImageExport } from '@/components/ImageExport';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const HEADER_HEIGHT = 74;
const FOOTER_HEIGHT = 64;

// mesmas cores dos cartões do fluxo
const stateStyles: Record<AcademicState, string> = {
    completed: 'border-success bg-success/10',
    enrolled: 'border-info bg-info/10',
    overdue: 'border-destructive bg-destructive/10',
    pending: 'border-border bg-muted',
    unknown: 'border-dashed border-border bg-background'
};

/** Fluxograma inteiro, no layout do desktop, exportado como imagem como no web. */
export function CurriculumImageExport({
    model,
    name,
    matrix,
    state,
    onDone
}: {
    model: CurriculumModel;
    name: string;
    matrix: string;
    state?: (subject: FlowSubject) => AcademicState;
    onDone: (failed: boolean) => void;
}) {
    const geometry = useMemo(() => layoutCurriculum(model, 0), [model]);
    const width = Math.ceil(Math.max(520, geometry.width));
    return (
        <ImageExport width={width} title={`Fluxograma de ${name}`} onDone={onDone}>
            <View
                style={{ width, height: geometry.height + HEADER_HEIGHT + FOOTER_HEIGHT }}
                className="bg-background"
            >
                <View style={{ height: HEADER_HEIGHT }} className="justify-center px-6">
                    <Text className="text-2xl font-bold">{name}</Text>
                    <Text className="text-sm text-muted-foreground">{matrix}</Text>
                </View>
                <View
                    style={{
                        width: geometry.width,
                        height: geometry.height,
                        marginLeft: (width - geometry.width) / 2
                    }}
                >
                    <Connections model={model} geometry={geometry} visibleEdges={null} />
                    {geometry.columns.map(({ period, x }) => (
                        <Text
                            key={period}
                            style={{ position: 'absolute', left: x - 60, top: 12, width: 120 }}
                            className="text-center text-sm font-bold"
                        >
                            {period}º semestre
                        </Text>
                    ))}
                    {geometry.nodes.map(({ subject, x, y, width: cardWidth, height }) => (
                        <View
                            key={subject.code}
                            style={{
                                position: 'absolute',
                                left: x,
                                top: y,
                                width: cardWidth,
                                height
                            }}
                            className={cn(
                                'gap-0.5 rounded-lg border px-3 py-2',
                                stateStyles[state?.(subject) ?? 'pending']
                            )}
                        >
                            <Text className="text-xs text-muted-foreground">{subject.code}</Text>
                            <Text numberOfLines={4} className="text-xs leading-4 font-bold">
                                {titleCase(subject.name)}
                            </Text>
                            <Text className="mt-auto self-end text-xs text-muted-foreground">
                                {hoursText(subject.hours)} · {creditText(subject.hours, 'short')}
                            </Text>
                        </View>
                    ))}
                </View>
                <View style={{ height: FOOTER_HEIGHT }} className="items-center justify-center">
                    <Text className="text-base font-medium text-muted-foreground">followw.app</Text>
                </View>
            </View>
        </ImageExport>
    );
}
