import type { FlowEdge, FlowSubject } from '#/lib/curriculum/model';

export function curriculumEdges(
    subjects: FlowSubject[],
    byCode: Map<string, FlowSubject>
): FlowEdge[] {
    const edges: FlowEdge[] = [];
    const pairs = new Set<string>();
    for (const subject of subjects) {
        for (const kind of ['prerequisite', 'corequisite'] as const) {
            const groups =
                (kind === 'prerequisite' ? subject.prerequisites : subject.corequisites) ?? [];
            groups.forEach((group, index) => {
                for (const code of new Set(group)) {
                    if (!byCode.has(code) || (kind === 'corequisite' && code === subject.code))
                        continue;
                    const pair = [code, subject.code].toSorted().join(':');
                    if (kind === 'corequisite' && groups.length === 1) {
                        if (pairs.has(pair)) continue;
                        pairs.add(pair);
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

export function relatedEdgeIds(edges: FlowEdge[], code: string): Set<string> {
    const related = new Set<string>();
    for (const direction of ['source', 'target'] as const) {
        const adjacency = new Map<string, { code: string; id: string }[]>();
        const add = (from: string, to: string, id: string) => {
            const list = adjacency.get(from) ?? [];
            list.push({ code: to, id });
            adjacency.set(from, list);
        };
        for (const edge of edges) {
            const from = edge[direction];
            const to = edge[direction === 'source' ? 'target' : 'source'];
            add(from, to, edge.id);
            if (edge.kind === 'corequisite') add(to, from, edge.id);
        }
        const visited = new Set<string>();
        const queue = [code];
        for (let index = 0; index < queue.length; index++) {
            const current = queue[index];
            if (visited.has(current)) continue;
            visited.add(current);
            for (const next of adjacency.get(current) ?? []) {
                related.add(next.id);
                if (!visited.has(next.code)) queue.push(next.code);
            }
        }
    }
    return related;
}
