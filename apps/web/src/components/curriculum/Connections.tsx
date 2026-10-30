import { useId, useMemo } from 'react';

import type { CurriculumModel, FlowGeometry } from '#/lib/curriculum/types';

import { edgeLabel } from '#/lib/curriculum/format';
import { pathData } from '#/lib/curriculum/geometry';
import { connectionSegments } from '#/lib/curriculum/segments';

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
            className="pointer-events-none absolute inset-0 text-primary"
            width={geometry.width}
            height={geometry.height}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- SVG tem semântica própria de imagem vetorial.
            role="img"
            aria-label="Pré-requisitos e correquisitos na cor principal; correquisitos com duas pontas, verticais no mesmo semestre. Linhas tracejadas indicam alternativas, detalhadas nos cartões."
        >
            <defs>
                <marker
                    id={marker}
                    markerWidth="5"
                    markerHeight="5"
                    refX="4"
                    refY="2.5"
                    orient="auto-start-reverse"
                >
                    <path d="M0 0 L5 2.5 L0 5 Z" fill="currentColor" />
                </marker>
            </defs>
            {segments.map(({ points, kind, alternative }) => (
                <g key={`${kind}:${alternative}:${pathData(points)}`} data-route-segment="true">
                    <path
                        d={pathData(points)}
                        fill="none"
                        stroke="var(--background)"
                        strokeWidth="5"
                    />
                    <path
                        d={pathData(points)}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeDasharray={
                            alternative ? '4 3' : kind === 'corequisite' ? '2 3' : undefined
                        }
                    />
                </g>
            ))}
            {junctions.map(({ x, y }) => (
                <circle key={`${x}:${y}`} cx={x} cy={y} r="2" fill="currentColor" />
            ))}
            {routes.map(({ edge }) => (
                <g key={edge.id} data-edge-id={edge.id} data-relation={edge.kind}>
                    <title>{edgeLabel(edge, model.byCode)}</title>
                    {arrows
                        .filter(({ edgeIds }) => edgeIds[0] === edge.id)
                        .map(({ points, startArrow, endArrow }) => (
                            <path
                                key={`${startArrow}:${pathData(points)}`}
                                d={pathData(points)}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1"
                                markerStart={startArrow ? `url(#${marker})` : undefined}
                                markerEnd={endArrow ? `url(#${marker})` : undefined}
                            />
                        ))}
                </g>
            ))}
        </svg>
    );
}
