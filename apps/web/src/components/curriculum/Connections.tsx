import type { CurriculumModel, FlowGeometry } from '@followw/core/lib/curriculum/types.ts';

import { edgeLabel } from '@followw/core/lib/curriculum/format.ts';
import { pathData } from '@followw/core/lib/curriculum/geometry.ts';
import { connectionSegments } from '@followw/core/lib/curriculum/segments.ts';
import { useId, useMemo } from 'react';

// uma classe por índice de RoutedEdge.color
const palette = [
    'text-flow-1',
    'text-flow-2',
    'text-flow-3',
    'text-flow-4',
    'text-flow-5',
    'text-flow-6',
    'text-flow-7'
];

export function Connections({
    model,
    geometry,
    visibleEdges
}: {
    model: CurriculumModel;
    geometry: FlowGeometry;
    visibleEdges: Set<string> | null;
}) {
    const marker = useId().replaceAll(':', '');
    const routes = useMemo(
        () => geometry.edges.filter(({ edge }) => !visibleEdges || visibleEdges.has(edge.id)),
        [geometry, visibleEdges]
    );
    const { segments, arrows, junctions } = useMemo(() => connectionSegments(routes), [routes]);
    return (
        <svg
            className="pointer-events-none absolute inset-0"
            width={geometry.width}
            height={geometry.height}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- SVG tem semântica própria de imagem vetorial.
            role="img"
            aria-label="Pré-requisitos e correquisitos, coloridos por matéria de destino; correquisitos com duas pontas, verticais no mesmo semestre. Alternativas detalhadas nos cartões."
        >
            <defs>
                {palette.map((color, index) => (
                    <marker
                        key={color}
                        id={`${marker}-${index}`}
                        className={color}
                        markerWidth="5"
                        markerHeight="5"
                        refX="4"
                        refY="2.5"
                        orient="auto-start-reverse"
                    >
                        <path d="M0 0 L5 2.5 L0 5 Z" fill="currentColor" />
                    </marker>
                ))}
            </defs>
            {segments.map(({ points, color }) => (
                <g
                    key={`${color}:${pathData(points)}`}
                    className={palette[color]}
                    data-route-segment="true"
                >
                    <path
                        d={pathData(points)}
                        fill="none"
                        stroke="var(--background)"
                        strokeWidth="5"
                    />
                    <path d={pathData(points)} fill="none" stroke="currentColor" strokeWidth="1" />
                </g>
            ))}
            {junctions.map(({ x, y, color }) => (
                <circle
                    key={`${color}:${x}:${y}`}
                    className={palette[color]}
                    cx={x}
                    cy={y}
                    r="2"
                    fill="currentColor"
                />
            ))}
            {routes.map(({ edge }) => (
                <g key={edge.id} data-edge-id={edge.id} data-relation={edge.kind}>
                    <title>{edgeLabel(edge, model.byCode)}</title>
                    {arrows
                        .filter(({ edgeIds }) => edgeIds[0] === edge.id)
                        .map(({ points, color, startArrow, endArrow }) => (
                            <path
                                key={`${startArrow}:${pathData(points)}`}
                                className={palette[color]}
                                d={pathData(points)}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1"
                                markerStart={startArrow ? `url(#${marker}-${color})` : undefined}
                                markerEnd={endArrow ? `url(#${marker}-${color})` : undefined}
                            />
                        ))}
                </g>
            ))}
        </svg>
    );
}
