import { expect, test } from 'bun:test';

import type { Point } from '../../../src/lib/curriculum/types.ts';

import { colorConnections } from '../../../src/lib/curriculum/colors.ts';

const route = (id: string, net: string, points: Point[]) => ({
    edge: {
        id,
        kind: 'prerequisite' as const,
        source: id,
        target: 'D',
        group: 1,
        alternative: false
    },
    net,
    color: 0,
    points
});

test('atribui cores diferentes às redes que se cruzam e mantém a cor dos ramos', () => {
    const [horizontal, vertical, branch, distant] = colorConnections([
        route('A', 'primeira', [
            { x: 0, y: 10 },
            { x: 20, y: 10 }
        ]),
        route('B', 'segunda', [
            { x: 10, y: 0 },
            { x: 10, y: 20 }
        ]),
        route('C', 'primeira', [
            { x: 0, y: 15 },
            { x: 6, y: 15 },
            { x: 6, y: 10 },
            { x: 20, y: 10 }
        ]),
        route('D', 'distante', [
            { x: 30, y: 10 },
            { x: 50, y: 10 }
        ])
    ]);

    expect(horizontal.color).not.toBe(vertical.color);
    expect(horizontal.color).toBe(branch.color);
    expect(distant.color).toBe(0);
});
