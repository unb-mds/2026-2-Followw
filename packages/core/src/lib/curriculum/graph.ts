export function groupBy<K, V>(entries: Iterable<readonly [K, V]>): Map<K, V[]> {
    const groups = new Map<K, V[]>();
    for (const [key, value] of entries) {
        const list = groups.get(key);
        if (list) list.push(value);
        else groups.set(key, [value]);
    }
    return groups;
}

/** Busca em largura a partir de `start`, devolvendo os nós na ordem de visita. */
export function traverse(start: string, neighbors: (node: string) => Iterable<string>): string[] {
    const visited = new Set([start]);
    const queue = [start];
    for (let index = 0; index < queue.length; index++) {
        for (const next of neighbors(queue[index])) {
            if (visited.has(next)) continue;
            visited.add(next);
            queue.push(next);
        }
    }
    return queue;
}
