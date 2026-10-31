import { expect, test } from 'bun:test';

import type { RoutedEdge } from '#/lib/curriculum/types';

import { connectionSegments } from '#/lib/curriculum/segments';

const route = (id: string, start: number, alternative = false): RoutedEdge => ({
    edge: { id, source: id, target: 'DESTINO', kind: 'prerequisite', group: 1, alternative },
    points: [
        { x: start, y: 20 },
        { x: 100, y: 20 }
    ]
});

test('une trechos parcialmente sobrepostos e desenha uma única ponta para o mesmo destino', () => {
    const { segments, arrows } = connectionSegments([route('A', 0), route('B', 40)]);
    expect(segments).toHaveLength(1);
    expect(segments[0].points).toEqual([
        { x: 0, y: 20 },
        { x: 100, y: 20 }
    ]);
    expect(segments[0].edgeIds.toSorted()).toEqual(['A', 'B']);
    expect(arrows).toHaveLength(1);
    expect(arrows[0].endArrow).toBe(true);
});

test('filtrar uma relação reconstrói somente seu trajeto e preserva estilos de alternativas', () => {
    const all = [route('A', 0), route('B', 40, true)];
    expect(connectionSegments(all).segments).toHaveLength(2);
    const filtered = connectionSegments(all.filter(({ edge }) => edge.id === 'B'));
    expect(filtered.segments).toHaveLength(1);
    expect(filtered.segments[0].points[0].x).toBe(40);
    expect(filtered.segments[0].alternative).toBe(true);
    expect(filtered.segments[0].edgeIds).toEqual(['B']);
});

test('mantém as duas pontas nos correquisitos e ignora segmentos vazios', () => {
    const value = route('A', 0);
    value.edge.kind = 'corequisite';
    value.points.splice(1, 0, value.points[0]);
    const { segments, arrows } = connectionSegments([value]);
    expect(segments).toHaveLength(1);
    expect(arrows.filter((arrow) => arrow.startArrow)).toHaveLength(1);
    expect(arrows.filter((arrow) => arrow.endArrow)).toHaveLength(1);
});

test('marca bifurcações reais sem transformar cruzamentos independentes em junções', () => {
    const first = route('A', 0);
    first.points = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 30 },
        { x: 50, y: 30 }
    ];
    const second = route('B', 0);
    second.points = [
        { x: 0, y: 20 },
        { x: 10, y: 20 },
        { x: 10, y: 30 },
        { x: 50, y: 30 }
    ];
    expect(connectionSegments([first, second]).junctions).toContainEqual({ x: 10, y: 20 });
    const crossing = route('C', 0);
    crossing.points = [
        { x: 5, y: -10 },
        { x: 5, y: 40 }
    ];
    expect(connectionSegments([first, crossing]).junctions).toEqual([]);
});
