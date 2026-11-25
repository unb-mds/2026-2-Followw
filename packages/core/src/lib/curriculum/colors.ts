import type { Point, RoutedEdge } from './types.ts';

import { groupBy } from './graph.ts';
import { perpendicularCrossing } from './intersections.ts';

const COLOR_COUNT = 7;
type NetworkRoute = RoutedEdge & { net: string };

export function colorConnections(routes: NetworkRoute[]): RoutedEdge[] {
    const networks = groupBy(routes.map((route) => [route.net, route] as const));
    const conflicts = new Map([...networks.keys()].map((net) => [net, new Set<string>()]));
    const horizontal: { net: string; start: Point; end: Point }[] = [];
    const vertical: typeof horizontal = [];
    for (const { net, points } of routes) {
        for (let i = 1; i < points.length; i++) {
            const start = points[i - 1];
            const end = points[i];
            (start.x === end.x ? vertical : horizontal).push({ net, start, end });
        }
    }
    for (const v of vertical) {
        for (const h of horizontal) {
            if (v.net === h.net || conflicts.get(v.net)!.has(h.net)) continue;
            if (perpendicularCrossing(v.start, v.end, h.start, h.end)) {
                conflicts.get(v.net)!.add(h.net);
                conflicts.get(h.net)!.add(v.net);
            }
        }
    }

    const colors = new Map<string, number>();
    for (const [net, neighbors] of [...conflicts].toSorted((a, b) => b[1].size - a[1].size)) {
        const preferred = networks.get(net)![0].color;
        const taken = new Set([...neighbors].map((neighbor) => colors.get(neighbor)));
        let color = preferred;
        for (let offset = 0; offset < COLOR_COUNT; offset++) {
            const candidate = (preferred + offset) % COLOR_COUNT;
            if (taken.has(candidate)) continue;
            color = candidate;
            break;
        }
        colors.set(net, color);
    }
    return routes.map(({ edge, points, net }) => ({ edge, points, color: colors.get(net)! }));
}
