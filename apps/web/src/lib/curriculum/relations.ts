import type { FlowEdge, FlowSubject } from '#/lib/curriculum/types';

import { groupBy, traverse } from '#/lib/curriculum/graph';

export function curriculumEdges(
    subjects: FlowSubject[],
    byCode: Map<string, FlowSubject>
): FlowEdge[] {
    const edges: FlowEdge[] = [];
    const mutualPairs = new Set<string>();
    for (const subject of subjects) {
        for (const [kind, groups = []] of [
            ['prerequisite', subject.prerequisites ?? undefined],
            ['corequisite', subject.corequisites ?? undefined]
        ] as const) {
            // correquisito sem alternativa liga as duas matérias por uma linha só
            const mutual = kind === 'corequisite' && groups.length === 1;
            groups.forEach((group, index) => {
                for (const code of new Set(group.map((requirement) => requirement.code))) {
                    if (!byCode.has(code) || (kind === 'corequisite' && code === subject.code))
                        continue;
                    if (mutual) {
                        const pair = [code, subject.code].toSorted().join(':');
                        if (mutualPairs.has(pair)) continue;
                        mutualPairs.add(pair);
                    }
                    edges.push({
                        id: `${kind}:${subject.code}:${index}:${code}`,
                        kind,
                        source: code,
                        target: subject.code,
                        group: index + 1,
                        alternative: groups.length > 1
                    });
                }
            });
        }
    }
    return edges;
}

/** Para cada matéria, as que a exigem como pré-requisito, sem repetir. */
export function unlockedSubjects(
    edges: FlowEdge[],
    byCode: Map<string, FlowSubject>
): Map<string, FlowSubject[]> {
    const targets = groupBy(
        edges.flatMap((edge) =>
            edge.kind === 'prerequisite' ? [[edge.source, edge.target] as const] : []
        )
    );
    return new Map(
        [...targets].map(([code, list]) => [
            code,
            [...new Set(list)].map((target) => byCode.get(target)!)
        ])
    );
}

const otherEnd = (edge: FlowEdge, code: string) =>
    edge.source === code ? edge.target : edge.source;

/** Arestas de todos os antecessores e sucessores; correquisitos valem nos dois sentidos. */
export function relatedEdgeIds(edges: FlowEdge[], code: string): Set<string> {
    const related = new Set<string>();
    for (const direction of ['source', 'target'] as const) {
        const outgoing = groupBy(
            edges.flatMap((edge) => {
                const from = [edge[direction], edge] as const;
                return edge.kind === 'corequisite'
                    ? [from, [otherEnd(edge, from[0]), edge] as const]
                    : [from];
            })
        );
        for (const node of traverse(code, (current) =>
            (outgoing.get(current) ?? []).map((edge) => otherEnd(edge, current))
        ))
            for (const edge of outgoing.get(node) ?? []) related.add(edge.id);
    }
    return related;
}

/** Mantém a ordem dada, puxando cada grupo de correquisitos para junto do primeiro membro. */
export function groupCorequisites(subjects: FlowSubject[], edges: FlowEdge[]): FlowSubject[] {
    const byCode = new Map(subjects.map((subject) => [subject.code, subject]));
    const neighbors = groupBy(
        edges.flatMap((edge) =>
            edge.kind === 'corequisite' && byCode.has(edge.source) && byCode.has(edge.target)
                ? [[edge.source, edge.target] as const, [edge.target, edge.source] as const]
                : []
        )
    );
    const ordered = new Set<string>();
    for (const subject of subjects) {
        if (ordered.has(subject.code)) continue;
        for (const code of traverse(subject.code, (node) => neighbors.get(node) ?? []))
            ordered.add(code);
    }
    return [...ordered].map((code) => byCode.get(code)!);
}
