import type { FlowNode, Point } from '#/lib/curriculum/types';

const CLEARANCE = 8;

function touches(point: Point, node: FlowNode) {
    return (
        point.x >= node.x &&
        point.x <= node.x + node.width &&
        point.y >= node.y &&
        point.y <= node.y + node.height
    );
}

export function shortestChannelPath(
    from: Point,
    to: Point,
    channels: { departure: number; arrival: number },
    corridors: number[],
    nodes: FlowNode[]
): Point[] {
    const { departure, arrival } = channels;
    const path = (y: number): Point[] => [
        from,
        { x: departure, y: from.y },
        { x: departure, y },
        { x: arrival, y },
        { x: arrival, y: to.y },
        to
    ];
    const distance = (y: number) => Math.abs(from.y - y) + Math.abs(to.y - y);
    const bends = (y: number) => Number(y !== from.y) + Number(y !== to.y);
    const obstacles = nodes.map((node) => ({
        left: node.x - CLEARANCE,
        right: node.x + node.width + CLEARANCE,
        top: node.y - CLEARANCE,
        bottom: node.y + node.height + CLEARANCE,
        source: touches(from, node),
        target: touches(to, node)
    }));
    const isClear = (points: Point[]) =>
        points.slice(1).every((b, index) => {
            const a = points[index];
            if (a.x === b.x && a.y === b.y) return true;
            return obstacles.every((box) => {
                if ((index === 0 && box.source) || (index === points.length - 2 && box.target))
                    return true;
                return a.y === b.y
                    ? a.y <= box.top ||
                          a.y >= box.bottom ||
                          Math.max(a.x, b.x) <= box.left ||
                          Math.min(a.x, b.x) >= box.right
                    : a.x <= box.left ||
                          a.x >= box.right ||
                          Math.max(a.y, b.y) <= box.top ||
                          Math.min(a.y, b.y) >= box.bottom;
            });
        });
    let best = corridors[0];
    for (const y of new Set([from.y, to.y, ...corridors])) {
        if (
            distance(y) > distance(best) ||
            (distance(y) === distance(best) && bends(y) >= bends(best))
        )
            continue;
        if (isClear(path(y))) best = y;
    }
    return path(best);
}
