import type { CurriculumModel, FlowGeometry } from '@followw/core/lib/curriculum/types.ts';

import { pathData } from '@followw/core/lib/curriculum/geometry.ts';
import { connectionSegments } from '@followw/core/lib/curriculum/segments.ts';
import { useMemo } from 'react';
import { Circle, G, Path, Svg } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

const TOKENS = ['--color-background', ...[1, 2, 3, 4, 5, 6, 7].map((i) => `--color-flow-${i}`)];
const ARROW = 5;

// triângulo com a ponta em `tip`, apontando para longe de `from`
function arrowHead(tip: { x: number; y: number }, from: { x: number; y: number }) {
    const dx = Math.sign(tip.x - from.x);
    const dy = Math.sign(tip.y - from.y);
    const base = { x: tip.x - dx * ARROW, y: tip.y - dy * ARROW };
    const half = ARROW / 2;
    // perpendicular ao eixo (rotas só têm segmentos horizontais e verticais)
    const px = dy * half;
    const py = dx * half;
    return `M ${tip.x} ${tip.y} L ${base.x + px} ${base.y - py} L ${base.x - px} ${base.y + py} Z`;
}

export function Connections({
    geometry,
    visibleEdges
}: {
    model: CurriculumModel;
    geometry: FlowGeometry;
    visibleEdges: Set<string> | null;
}) {
    const [background, ...flow] = useCSSVariable(TOKENS).map((value) =>
        typeof value === 'string' ? value : '#888'
    );
    const routes = useMemo(
        () => geometry.edges.filter(({ edge }) => !visibleEdges || visibleEdges.has(edge.id)),
        [geometry, visibleEdges]
    );
    const { segments, arrows, junctions } = useMemo(() => connectionSegments(routes), [routes]);
    const color = (index: number) => flow[index % flow.length];
    return (
        <Svg
            pointerEvents="none"
            width={geometry.width}
            height={geometry.height}
            style={{ position: 'absolute', left: 0, top: 0 }}
            accessibilityLabel="Pré-requisitos e correquisitos, coloridos por matéria de destino; correquisitos com duas pontas, verticais no mesmo semestre. Alternativas detalhadas nos cartões."
        >
            {segments.map(({ points, color: index }) => (
                <G key={`${index}:${pathData(points)}`}>
                    <Path d={pathData(points)} fill="none" stroke={background} strokeWidth={5} />
                    <Path d={pathData(points)} fill="none" stroke={color(index)} strokeWidth={1} />
                </G>
            ))}
            {junctions.map(({ x, y, color: index }) => (
                <Circle key={`${index}:${x}:${y}`} cx={x} cy={y} r={2} fill={color(index)} />
            ))}
            {arrows.map(({ points, color: index, startArrow, endArrow }) => (
                <G key={`${startArrow}:${pathData(points)}`}>
                    {startArrow && <Path d={arrowHead(points[0], points[1])} fill={color(index)} />}
                    {endArrow && <Path d={arrowHead(points[1], points[0])} fill={color(index)} />}
                </G>
            ))}
        </Svg>
    );
}
