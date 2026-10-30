import type { FlowNode, Point } from '#/lib/curriculum/geometry';
import type { FlowEdge, FlowSubject } from '#/lib/curriculum/model';

export function groupCorequisites(subjects: FlowSubject[], edges: FlowEdge[]): FlowSubject[] {
    const byCode = new Map(subjects.map((subject) => [subject.code, subject]));
    const neighbors = new Map<string, Set<string>>();
    for (const edge of edges) {
        if (edge.kind !== 'corequisite' || !byCode.has(edge.source) || !byCode.has(edge.target))
            continue;
        for (const [from, to] of [
            [edge.source, edge.target],
            [edge.target, edge.source]
        ]) {
            const list = neighbors.get(from) ?? new Set<string>();
            list.add(to);
            neighbors.set(from, list);
        }
    }
    const ordered: FlowSubject[] = [];
    const visited = new Set<string>();
    for (const subject of subjects) {
        const queue = [subject.code];
        for (let index = 0; index < queue.length; index++) {
            const code = queue[index];
            if (visited.has(code)) continue;
            visited.add(code);
            ordered.push(byCode.get(code)!);
            for (const neighbor of neighbors.get(code) ?? [])
                if (!visited.has(neighbor)) queue.push(neighbor);
        }
    }
    return ordered;
}

export function verticalCorequisitePath(
    upper: FlowNode,
    lower: FlowNode,
    upperX: number,
    lowerX: number,
    arrivalY: number,
    departureY?: number,
    laneX?: number
): Point[] {
    const from = { x: upperX, y: upper.y + upper.height };
    const to = { x: lowerX, y: lower.y };
    if (departureY === undefined || laneX === undefined) {
        return [from, { x: from.x, y: arrivalY }, { x: to.x, y: arrivalY }, to];
    }
    return [
        from,
        { x: from.x, y: departureY },
        { x: laneX, y: departureY },
        { x: laneX, y: arrivalY },
        { x: to.x, y: arrivalY },
        to
    ];
}
