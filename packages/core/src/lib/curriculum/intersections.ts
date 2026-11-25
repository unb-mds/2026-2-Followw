import type { Point } from './types.ts';

export function perpendicularCrossing(a: Point, b: Point, c: Point, d: Point): Point | undefined {
    if (a.x !== b.x || c.y !== d.y) return undefined;
    return a.x > Math.min(c.x, d.x) &&
        a.x < Math.max(c.x, d.x) &&
        c.y > Math.min(a.y, b.y) &&
        c.y < Math.max(a.y, b.y)
        ? { x: a.x, y: c.y }
        : undefined;
}
