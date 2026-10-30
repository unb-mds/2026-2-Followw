import { expect, test } from 'bun:test';

import { portLanes } from '#/lib/curriculum/lanes';

test('separa trechos próximos e reutiliza faixas de trechos distantes para manter o fluxo compacto', () => {
    const result = portLanes(
        [
            { id: 'A', start: 0, end: 40 },
            { id: 'B', start: 30, end: 60 },
            { id: 'C', start: 46, end: 70 },
            { id: 'D', start: 80, end: 100 }
        ],
        8
    );
    expect(result.lanes.get('A')).not.toBe(result.lanes.get('B'));
    expect(result.lanes.get('A')).not.toBe(result.lanes.get('C'));
    expect(result.lanes.get('A')).toBe(result.lanes.get('D'));
    expect(result.count).toBe(3);
});

test('origem e destino da mesma linha compartilham uma faixa mesmo com trechos invertidos', () => {
    const result = portLanes(
        [
            { id: 'A', start: 40, end: 10 },
            { id: 'A', start: 50, end: 70 },
            { id: 'B', start: 30, end: 60 }
        ],
        8
    );
    expect(result.count).toBe(2);
    expect(result.lanes.size).toBe(2);
    expect(result.lanes.get('A')).not.toBe(result.lanes.get('B'));
    expect(portLanes([], 8).count).toBe(0);
});
