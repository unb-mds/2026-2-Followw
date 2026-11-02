import type { FlowEdge, FlowNode, FlowSubject, Point, RoutedEdge } from '#/lib/curriculum/types';

import { groupBy } from '#/lib/curriculum/graph';
import { portLanes, type PortSpan } from '#/lib/curriculum/lanes';
import { shortestChannelPath } from '#/lib/curriculum/shortcuts';

const SPACING = 12;
const INSET = 16;
const COLORS = 7;
// acima disso, as setas de um destino se juntam numa chegada só para caber no cartão
const SEPARATE_ARRIVALS = 6;

// donos de rede vizinhos na coluna e entre colunas ficam com cores diferentes
const color = ({ row, column }: FlowNode) => (row + 2 * column) % COLORS;

// corredor do lado do destino voltado para a origem, para a linha não passar do destino
const gutterRow = (source: number, target: number) => (source > target ? target + 1 : target);

const slotY = (card: FlowNode, slots: string[], slot: string) =>
    card.y + card.height / 2 + (slots.indexOf(slot) - (slots.length - 1) / 2) * SPACING;

type Connection =
    // correquisito no mesmo semestre, desenhado na vertical
    | { kind: 'stacked'; edge: FlowEdge }
    // pelos corredores entre semestres; a rede é da origem, ou do destino se ele lotar
    | { kind: 'channel'; edge: FlowEdge; net: string; owner: string; arrival: string };

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
    const stacked = (edge: FlowEdge) =>
        edge.kind === 'corequisite' &&
        locations.get(edge.source)!.col === locations.get(edge.target)!.col;
    // a mesma origem aparece em vários grupos alternativos, mas chega numa seta só
    const incoming = groupBy(
        edges.flatMap((edge) =>
            stacked(edge) ? [] : [[edge.target, `${edge.kind}:${edge.source}`] as const]
        )
    );
    const connections = edges.map((edge): Connection => {
        if (stacked(edge)) return { kind: 'stacked', edge };
        const crowded = new Set(incoming.get(edge.target)).size > SEPARATE_ARRIVALS;
        const owner = crowded ? edge.target : edge.source;
        return {
            kind: 'channel',
            edge,
            net: `${crowded ? 'to' : 'from'}:${owner}:${edge.kind}`,
            owner,
            arrival: crowded ? edge.kind : `${edge.kind}:${edge.source}`
        };
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
    for (const connection of connections) {
        if (connection.kind !== 'channel') continue;
        const { edge, net: id } = connection;
        const source = locations.get(edge.source)!;
        const target = locations.get(edge.target)!;
        const usesGutter = target.col !== source.col + 1;
        const row = gutterRow(source.row, target.row);
        if (usesGutter)
            rowSpans[row].push({
                id,
                start: Math.min(target.col, source.col + 1),
                end: Math.max(target.col, source.col + 1)
            });
        const arrival = usesGutter ? row : target.row + 0.5;
        gapSpans[target.col].push({ id, start: arrival, end: target.row + 0.5 });
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
            type Channel = Extract<Connection, { kind: 'channel' }>;
            const channels = connections.flatMap((c) => (c.kind === 'channel' ? [c] : []));
            // uma saída por rede, para redes diferentes não dividirem o mesmo trecho
            const departures = groupBy(channels.map((c) => [c.edge.source, c.net] as const));
            // cada origem chega numa altura própria, na ordem vertical das origens
            const arrivals = groupBy(
                channels
                    .toSorted((a, b) => {
                        const [first, second] = [node(a.edge.source), node(b.edge.source)];
                        return first.row - second.row || second.column - first.column;
                    })
                    .map((c) => [c.edge.target, c.arrival] as const)
            );
            const departureY = (card: FlowNode, net: string) =>
                slotY(card, [...new Set(departures.get(card.subject.code))], net);
            // chegada na altura de uma saída do cartão à esquerda desce meio passo, sem sobrepor
            const arrivalY = (card: FlowNode, arrival: string) => {
                const slots = [...new Set(arrivals.get(card.subject.code))];
                const left = nodes.find(
                    (item) => item.column === card.column - 1 && item.row === card.row
                );
                // altura de saída do vizinho → rede que a usa
                const taken = new Map(
                    [...new Set(left ? departures.get(left.subject.code) : [])].map(
                        (net) => [departureY(left!, net), net] as const
                    )
                );
                const incomingNets = new Map(
                    channels
                        .filter(({ edge }) => edge.target === card.subject.code)
                        .map((c) => [c.arrival, c.net] as const)
                );
                const shift = slots.some((slot) => {
                    const net = taken.get(slotY(card, slots, slot));
                    return net !== undefined && net !== incomingNets.get(slot);
                });
                return slotY(card, slots, arrival) + (shift ? SPACING / 2 : 0);
            };
            const ports = ({ edge, net, arrival }: Channel) => {
                const source = node(edge.source);
                const target = node(edge.target);
                return {
                    from: { x: source.x + source.width, y: departureY(source, net) },
                    to: { x: target.x, y: arrivalY(target, arrival) }
                };
            };
            const laneX = (gap: number, id: string) =>
                gapStarts[gap] + INSET + gaps[gap].lanes.get(id)! * SPACING;
            const laneY = (row: number, id: string) =>
                rowTops[row] - INSET - gutters[row].lanes.get(id)! * SPACING;

            const ends = (edge: FlowEdge) =>
                [node(edge.source), node(edge.target)].toSorted((a, b) => a.row - b.row);
            // correquisito de longe chega ao lado do centro, que fica para o cartão logo acima
            const distant = groupBy(
                connections.flatMap((c) => {
                    if (c.kind !== 'stacked') return [];
                    const [upper, lower] = ends(c.edge);
                    return lower.row === upper.row + 1
                        ? []
                        : [[lower.subject.code, c.edge.id] as const];
                })
            );

            function path(connection: Connection): Point[] {
                const { edge } = connection;
                if (connection.kind === 'stacked') {
                    const source = node(edge.source);
                    const [upper, lower] = ends(edge);
                    const x = upper.x + upper.width / 2;
                    const slot = distant.get(lower.subject.code)?.indexOf(edge.id) ?? -1;
                    const toX = lower.x + lower.width / 2 + (slot + 1) * SPACING;
                    const from = { x, y: upper.y + upper.height };
                    const to = { x: toX, y: lower.y };
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
                                  { x: toX, y: arrival },
                                  to
                              ];
                    return upper === source ? points : points.toReversed();
                }
                const { net } = connection;
                const { from, to } = ports(connection);
                const departure = laneX(node(edge.source).column + 1, net);
                const arrival = laneX(node(edge.target).column, net);
                if (departure === arrival)
                    return [from, { x: departure, y: from.y }, { x: arrival, y: to.y }, to];
                return shortestChannelPath(
                    from,
                    to,
                    { departure, arrival },
                    laneY(gutterRow(node(edge.source).row, node(edge.target).row), net),
                    nodes
                );
            }
            return connections.map((connection): RoutedEdge => ({
                edge: connection.edge,
                points: simplify(path(connection)),
                color: color(
                    connection.kind === 'channel'
                        ? node(connection.owner)
                        : ends(connection.edge)[0]
                )
            }));
        }
    };
}
