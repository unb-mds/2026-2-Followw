import { describe, expect, test } from 'bun:test';

import type { FlowEdge } from '#/lib/curriculum/types';

import { relatedEdgeIds } from '#/lib/curriculum/relations';

const edge = (
    source: string,
    target: string,
    kind: FlowEdge['kind'] = 'prerequisite'
): FlowEdge => ({ id: `${source}:${target}`, source, target, kind, group: 1, alternative: false });

describe('destaque das relações do fluxo', () => {
    test('percorre todos os antecessores e sucessores, sem incluir ramos independentes', () => {
        const edges = [
            edge('A', 'B'),
            edge('B', 'C'),
            edge('C', 'D'),
            edge('X', 'C'),
            edge('A', 'Y'),
            edge('Z', 'W')
        ];
        expect([...relatedEdgeIds(edges, 'B')].toSorted()).toEqual(['A:B', 'B:C', 'C:D']);
        expect(relatedEdgeIds(edges, 'INEXISTENTE').size).toBe(0);
    });
    test('inclui correquisitos nos dois sentidos e termina mesmo quando há ciclos', () => {
        const edges = [
            edge('A', 'B'),
            edge('B', 'A'),
            edge('B', 'C', 'corequisite'),
            edge('C', 'D'),
            edge('X', 'Y')
        ];
        expect([...relatedEdgeIds(edges, 'C')].toSorted()).toEqual(['A:B', 'B:A', 'B:C', 'C:D']);
    });
});
