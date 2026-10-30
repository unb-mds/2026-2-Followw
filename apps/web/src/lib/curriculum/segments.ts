import type { Point, RoutedEdge } from '#/lib/curriculum/geometry';
import type { FlowEdge } from '#/lib/curriculum/model';

interface Segment {
    points: [Point, Point];
    edgeIds: string[];
    kind: FlowEdge['kind'];
    alternative: boolean;
    startArrow?: boolean;
    endArrow?: boolean;
}

export function connectionSegments(routes: RoutedEdge[]) {
    const bodies = new Map<string, Segment[]>();
    const arrows = new Map<string, Segment>();
    for (const { edge, points: rawPoints } of routes) {
        const points = rawPoints.filter(
            (point, index) =>
                index === 0 ||
                point.x !== rawPoints[index - 1].x ||
                point.y !== rawPoints[index - 1].y
        );
        for (let index = 1; index < points.length; index++) {
            const a = points[index - 1];
            const b = points[index];
            if (a.x === b.x && a.y === b.y) continue;
            const horizontal = a.y === b.y;
            const axis = horizontal ? 'x' : 'y';
            const pair: [Point, Point] = a[axis] <= b[axis] ? [a, b] : [b, a];
            const key = `${edge.kind}:${edge.alternative}:${horizontal ? 'h' : 'v'}:${horizontal ? a.y : a.x}`;
            const list = bodies.get(key) ?? [];
            list.push({
                points: pair,
                edgeIds: [edge.id],
                kind: edge.kind,
                alternative: edge.alternative
            });
            bodies.set(key, list);
            for (const start of [true, false]) {
                if (
                    start ? index !== 1 || edge.kind !== 'corequisite' : index !== points.length - 1
                )
                    continue;
                const tip = start ? a : b;
                const other = start ? b : a;
                const distance = Math.abs(tip.x - other.x) + Math.abs(tip.y - other.y);
                const nearby = {
                    x: tip.x + ((other.x - tip.x) * Math.min(4, distance)) / distance,
                    y: tip.y + ((other.y - tip.y) * Math.min(4, distance)) / distance
                };
                const arrowKey = `${edge.kind}:${edge.alternative}:${tip.x}:${tip.y}:${Math.sign(other.x - tip.x)}:${Math.sign(other.y - tip.y)}`;
                const existing = arrows.get(arrowKey);
                if (existing) existing.edgeIds.push(edge.id);
                else
                    arrows.set(arrowKey, {
                        points: start ? [tip, nearby] : [nearby, tip],
                        edgeIds: [edge.id],
                        kind: edge.kind,
                        alternative: edge.alternative,
                        startArrow: start,
                        endArrow: !start
                    });
            }
        }
    }
    const segments: Segment[] = [];
    for (const list of bodies.values()) {
        const horizontal = list[0].points[0].y === list[0].points[1].y;
        const axis = horizontal ? 'x' : 'y';
        let current: Segment | undefined;
        for (const segment of list.toSorted((a, b) => a.points[0][axis] - b.points[0][axis])) {
            if (current && segment.points[0][axis] <= current.points[1][axis]) {
                if (segment.points[1][axis] > current.points[1][axis])
                    current.points[1] = segment.points[1];
                current.edgeIds = [...new Set([...current.edgeIds, ...segment.edgeIds])];
            } else {
                current = { ...segment, points: [...segment.points] };
                segments.push(current);
            }
        }
    }
    const candidates = new Map<string, { point: Point; ids: Set<string> }>();
    for (const { edge, points } of routes) {
        for (const point of points.slice(1, -1)) {
            const key = `${point.x}:${point.y}`;
            const entry = candidates.get(key) ?? { point, ids: new Set<string>() };
            entry.ids.add(edge.id);
            candidates.set(key, entry);
        }
    }
    const junctions: Point[] = [];
    for (const { point, ids } of candidates.values()) {
        const directions = new Set<string>();
        for (const segment of segments) {
            if (!segment.edgeIds.some((id) => ids.has(id))) continue;
            const [a, b] = segment.points;
            if (a.x === b.x && point.x === a.x && point.y >= a.y && point.y <= b.y) {
                if (point.y > a.y) directions.add('up');
                if (point.y < b.y) directions.add('down');
            } else if (a.y === b.y && point.y === a.y && point.x >= a.x && point.x <= b.x) {
                if (point.x > a.x) directions.add('left');
                if (point.x < b.x) directions.add('right');
            }
        }
        if (directions.size >= 3) junctions.push(point);
    }
    return { segments, arrows: [...arrows.values()], junctions };
}
