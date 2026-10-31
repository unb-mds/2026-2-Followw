import type { FlowEdge, FlowNode, FlowSubject, Point, RoutedEdge } from '#/lib/curriculum/types';

import { groupBy } from '#/lib/curriculum/graph';
import { portLanes, type PortSpan } from '#/lib/curriculum/lanes';
import { shortestChannelPath } from '#/lib/curriculum/shortcuts';

const SPACING = 8;
const INSET = 16;

type Connection =
    // correquisito no mesmo semestre, desenhado na vertical
    | { kind: 'stacked'; edge: FlowEdge }
    // pelos corredores entre semestres, compartilhado por destino
    | { kind: 'channel'; edge: FlowEdge; net: string };

function simplify(points: Point[]) {
    const result: Point[] = [];
    for (const point of points) {
        const last = result.at(-1);
        if (last?.x === point.x && last.y === point.y) continue;
        const previous = result.at(-2);
        if (
            previous &&
            last &&
            ((previous.x === last.x && last.x === point.x) ||
                (previous.y === last.y && last.y === point.y))
        )
            result.pop();
        result.push(point);
    }
    return result;
}

export function planConnections(columns: FlowSubject[][], edges: FlowEdge[], minGap: number) {
    const locations = new Map(
        columns.flatMap((subjects, col) =>
            subjects.map((subject, row) => [subject.code, { col, row }] as const)
        )
    );
    const connections = edges.map((edge): Connection => {
        const source = locations.get(edge.source)!;
        const target = locations.get(edge.target)!;
        if (edge.kind === 'corequisite' && source.col === target.col)
            return { kind: 'stacked', edge };
        return { kind: 'channel', edge, net: `${edge.kind}:${edge.target}:${edge.alternative}` };
    });

    const rows = Math.max(0, ...columns.map((column) => column.length));
    const gapSpans: PortSpan[][] = Array.from({ length: columns.length + 1 }, () => []);
    const rowSpans: PortSpan[][] = Array.from({ length: rows }, () => []);
    for (const { edge } of connections.filter((c) => c.kind === 'stacked')) {
        const source = locations.get(edge.source)!;
        const upper = Math.min(source.row, locations.get(edge.target)!.row);
        const lower = Math.max(source.row, locations.get(edge.target)!.row);
        if (lower === upper + 1) continue;
        gapSpans[source.col + 1].push({ id: edge.id, start: upper + 1, end: lower });
        rowSpans[upper + 1].push({ id: edge.id, start: source.col, end: source.col + 1 });
        rowSpans[lower].push({ id: edge.id, start: source.col, end: source.col + 1 });
    }
    const nets = groupBy(
        connections.flatMap((c) => (c.kind === 'channel' ? [[c.net, c.edge] as const] : []))
    );
    for (const [id, group] of nets) {
        const target = locations.get(group[0].target)!;
        const sources = group.map((edge) => locations.get(edge.source)!);
        const gaps = new Set([target.col, ...sources.map((source) => source.col + 1)]);
        const usesGutter = gaps.size > 1;
        if (usesGutter)
            rowSpans[target.row].push({ id, start: Math.min(...gaps), end: Math.max(...gaps) });
        const arrival = usesGutter ? target.row : target.row + 0.5;
        gapSpans[target.col].push({ id, start: arrival, end: target.row + 0.5 });
        for (const source of sources)
            gapSpans[source.col + 1].push({ id, start: source.row + 0.5, end: arrival });
    }
    const gaps = gapSpans.map((spans) => portLanes(spans, 0));
    const gutters = rowSpans.map((spans) => portLanes(spans, 0));

    return {
        gapWidths: gaps.map(({ count }) => Math.max(minGap, INSET * 2 + count * SPACING)),
        gutterHeights: gutters.map(({ count }) => Math.max(32, INSET * 2 + count * SPACING)),
        route(nodes: FlowNode[], gapStarts: number[], rowTops: number[]) {
            const byCode = new Map(nodes.map((node) => [node.subject.code, node]));
            const node = (code: string) => byCode.get(code)!;
            const portStyles = groupBy(
                edges.flatMap((edge) =>
                    (['source', 'target'] as const).map(
                        (direction) =>
                            [
                                `${direction}:${edge[direction]}`,
                                `${edge.kind}:${edge.alternative}`
                            ] as const
                    )
                )
            );
            const port = (code: string, edge: FlowEdge, direction: 'source' | 'target') => {
                const card = node(code);
                const styles = [...new Set(portStyles.get(`${direction}:${code}`))];
                const slot = styles.indexOf(`${edge.kind}:${edge.alternative}`);
                return {
                    x: direction === 'source' ? card.x + card.width : card.x,
                    y: card.y + card.height / 2 + (slot - (styles.length - 1) / 2) * SPACING
                };
            };
            const laneX = (gap: number, id: string) =>
                gapStarts[gap] + INSET + gaps[gap].lanes.get(id)! * SPACING;
            const laneY = (row: number, id: string) =>
                rowTops[row] - INSET - gutters[row].lanes.get(id)! * SPACING;
            const corridors = [
                ...rowTops.map((top) => top - INSET),
                Math.max(...nodes.map((item) => item.y + item.height)) + INSET
            ];

            function path(connection: Connection): Point[] {
                const { edge } = connection;
                if (connection.kind === 'stacked') {
                    const source = node(edge.source);
                    const [upper, lower] = [source, node(edge.target)].toSorted(
                        (a, b) => a.row - b.row
                    );
                    const x = upper.x + upper.width / 2;
                    const from = { x, y: upper.y + upper.height };
                    const to = { x, y: lower.y };
                    const departure = laneY(upper.row + 1, edge.id);
                    const arrival = laneY(lower.row, edge.id);
                    const lane = laneX(source.column + 1, edge.id);
                    const points =
                        lower.row === upper.row + 1
                            ? [from, to]
                            : [
                                  from,
                                  { x, y: departure },
                                  { x: lane, y: departure },
                                  { x: lane, y: arrival },
                                  { x, y: arrival },
                                  to
                              ];
                    return upper === source ? points : points.toReversed();
                }
                const { net } = connection;
                const from = port(edge.source, edge, 'source');
                const to = port(edge.target, edge, 'target');
                const departure = laneX(node(edge.source).column + 1, net);
                const arrival = laneX(node(edge.target).column, net);
                if (departure === arrival)
                    return [from, { x: departure, y: from.y }, { x: arrival, y: to.y }, to];
                return shortestChannelPath(
                    from,
                    to,
                    { departure, arrival },
                    [laneY(node(edge.target).row, net), ...corridors],
                    nodes
                );
            }
            return connections.map((connection): RoutedEdge => ({
                edge: connection.edge,
                points: simplify(path(connection))
            }));
        }
    };
}
