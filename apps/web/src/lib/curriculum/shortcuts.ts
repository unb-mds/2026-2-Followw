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
    // faixa reservada à rede no corredor acima do destino
    reserved: number,
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
    // atalho só em linha reta: qualquer outra altura sairia das faixas reservadas e sobreporia outras redes
    return from.y === to.y && isClear(path(from.y)) ? path(from.y) : path(reserved);
}
