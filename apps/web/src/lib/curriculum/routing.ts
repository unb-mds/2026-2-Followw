import type { FlowNode, Point } from '#/lib/curriculum/geometry';
import type { FlowEdge, FlowSubject } from '#/lib/curriculum/model';

import { verticalCorequisitePath } from '#/lib/curriculum/corequisites';
import { portLanes, type PortSpan } from '#/lib/curriculum/lanes';
import { shortestChannelPath } from '#/lib/curriculum/shortcuts';

const SPACING = 8;
const INSET = 16;
const netId = (edge: FlowEdge) => `${edge.kind}:${edge.target}:${edge.alternative}`;

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

export function planConnections(columns: FlowSubject[][], edges: FlowEdge[], mobile: boolean) {
    const locations = new Map(
        columns.flatMap((subjects, col) =>
            subjects.map((subject, row) => [subject.code, { col, row }] as const)
        )
    );
    const rows = Math.max(0, ...columns.map((column) => column.length));
    const gapSpans: PortSpan[][] = Array.from({ length: columns.length + 1 }, () => []);
    const rowSpans: PortSpan[][] = Array.from({ length: rows }, () => []);
    const sameColumnCorequisite = (edge: FlowEdge) =>
        edge.kind === 'corequisite' &&
        locations.get(edge.source)?.col === locations.get(edge.target)?.col;
    const nets = new Map<string, FlowEdge[]>();
    for (const edge of edges) {
        const source = locations.get(edge.source);
        const target = locations.get(edge.target);
        if (!source || !target) continue;
        if (sameColumnCorequisite(edge)) {
            const upper = Math.min(source.row, target.row);
            const lower = Math.max(source.row, target.row);
            if (lower > upper + 1) {
                gapSpans[source.col + 1].push({ id: edge.id, start: upper + 1, end: lower });
                rowSpans[upper + 1].push({ id: edge.id, start: source.col, end: source.col + 1 });
                rowSpans[lower].push({ id: edge.id, start: source.col, end: source.col + 1 });
            }
            continue;
        }
        const id = netId(edge);
        const list = nets.get(id) ?? [];
        list.push(edge);
        nets.set(id, list);
    }
    for (const [id, group] of nets) {
        const target = locations.get(group[0].target)!;
        const gaps = new Set([
            target.col,
            ...group.map((edge) => locations.get(edge.source)!.col + 1)
        ]);
        const usesGutter = gaps.size > 1;
        if (usesGutter)
            rowSpans[target.row].push({ id, start: Math.min(...gaps), end: Math.max(...gaps) });
        gapSpans[target.col].push({
            id,
            start: usesGutter ? target.row : target.row + 0.5,
            end: target.row + 0.5
        });
        for (const edge of group) {
            const source = locations.get(edge.source)!;
            gapSpans[source.col + 1].push({
                id,
                start: source.row + 0.5,
                end: usesGutter ? target.row : target.row + 0.5
            });
        }
    }
    const gaps = gapSpans.map((spans) => portLanes(spans, 0));
    const gutters = rowSpans.map((spans) => portLanes(spans, 0));
    const gapWidths = gaps.map(({ count }) =>
        Math.max(mobile ? 24 : 40, INSET * 2 + count * SPACING)
    );
    const gutterHeights = gutters.map(({ count }) => Math.max(32, INSET * 2 + count * SPACING));
    return {
        gapWidths,
        gutterHeights,
        route(nodes: FlowNode[], gapStarts: number[], rowTops: number[], width: number) {
            const byCode = new Map(nodes.map((node) => [node.subject.code, node]));
            const portStyles = new Map<string, string[]>();
            for (const edge of edges) {
                for (const direction of ['source', 'target'] as const) {
                    const key = `${direction}:${edge[direction]}`;
                    const style = `${edge.kind}:${edge.alternative}`;
                    const list = portStyles.get(key) ?? [];
                    if (!list.includes(style)) list.push(style);
                    portStyles.set(key, list);
                }
            }
            const portY = (node: FlowNode, edge: FlowEdge, direction: 'source' | 'target') => {
                const styles = portStyles.get(`${direction}:${node.subject.code}`)!;
                const slot = styles.indexOf(`${edge.kind}:${edge.alternative}`);
                return node.y + node.height / 2 + (slot - (styles.length - 1) / 2) * SPACING;
            };
            const laneX = (gap: number, id: string) =>
                gapStarts[gap] + INSET + gaps[gap].lanes.get(id)! * SPACING;
            const laneY = (row: number, id: string) =>
                rowTops[row] - INSET - gutters[row].lanes.get(id)! * SPACING;
            return edges.map((edge) => {
                const source = byCode.get(edge.source);
                const target = byCode.get(edge.target);
                const from = source
                    ? { x: source.x + source.width, y: portY(source, edge, 'source') }
                    : null;
                const to = target ? { x: target.x, y: portY(target, edge, 'target') } : null;
                let points: Point[];
                if (source && target && sameColumnCorequisite(edge)) {
                    const upper = source.row < target.row ? source : target;
                    const lower = source.row < target.row ? target : source;
                    const adjacent = lower.row === upper.row + 1;
                    points = verticalCorequisitePath(
                        upper,
                        lower,
                        upper.x + upper.width / 2,
                        lower.x + lower.width / 2,
                        adjacent
                            ? (upper.y + upper.height + lower.y) / 2
                            : laneY(lower.row, edge.id),
                        adjacent ? undefined : laneY(upper.row + 1, edge.id),
                        adjacent ? undefined : laneX(source.column + 1, edge.id)
                    );
                    if (source.row > target.row) points.reverse();
                } else if (!from) points = [{ x: 0, y: to!.y }, to!];
                else if (!to) points = [from, { x: width, y: from.y }];
                else {
                    const id = netId(edge);
                    const departure = laneX(source!.column + 1, id);
                    const arrival = laneX(target!.column, id);
                    points =
                        departure === arrival
                            ? [from, { x: departure, y: from.y }, { x: arrival, y: to.y }, to]
                            : shortestChannelPath(
                                  from,
                                  to,
                                  { departure, arrival },
                                  [
                                      laneY(target!.row, id),
                                      ...rowTops.map((top) => top - INSET),
                                      Math.max(...nodes.map((node) => node.y + node.height)) + INSET
                                  ],
                                  nodes
                              );
                }
                return { edge, points: simplify(points) };
            });
        }
    };
}
