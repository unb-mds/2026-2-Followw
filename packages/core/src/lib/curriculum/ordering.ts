import type { CurriculumModel, FlowSubject } from './types.ts';

import { groupBy, traverse } from './graph.ts';

// medido nos cursos da UnB: peso maior encurta menos as linhas sem cruzar menos
const CROSSING = 0.5;
const SWEEPS = 8;
const BLOCKED = 1;
const SWAP_ROUNDS = 20;

// correquisitos do mesmo semestre andam juntos, em fileiras seguidas
type Block = FlowSubject[];
type Columns = Block[][];

const cache = new WeakMap<CurriculumModel, FlowSubject[][]>();

function blocks(model: CurriculumModel, period: number): Block[] {
    const subjects = model.subjects.filter((subject) => subject.period === period);
    const codes = new Set(subjects.map(({ code }) => code));
    const byCode = new Map(subjects.map((subject) => [subject.code, subject]));
    const neighbors = groupBy(
        model.edges.flatMap((edge) =>
            edge.kind === 'corequisite' && codes.has(edge.source) && codes.has(edge.target)
                ? [[edge.source, edge.target] as const, [edge.target, edge.source] as const]
                : []
        )
    );
    const seen = new Set<string>();
    return subjects
        .toSorted((a, b) => a.code.localeCompare(b.code))
        .flatMap((subject) => {
            if (seen.has(subject.code)) return [];
            const block = traverse(subject.code, (code) => neighbors.get(code) ?? []);
            for (const code of block) seen.add(code);
            return [block.map((code) => byCode.get(code)!)];
        });
}

/** Ordena cada semestre para aproximar matérias ligadas e evitar cruzamentos. */
export function orderColumns(model: CurriculumModel): FlowSubject[][] {
    const cached = cache.get(model);
    if (cached) return cached;
    const column = new Map(model.subjects.map((subject) => [subject.code, subject.period]));
    // cada par ligado conta uma vez, mesmo repetido em grupos alternativos
    const links = [
        ...new Map(
            model.edges
                .filter((edge) => column.get(edge.source) !== column.get(edge.target))
                .map((edge) => {
                    const pair = [edge.source, edge.target].toSorted(
                        (a, b) => column.get(a)! - column.get(b)!
                    );
                    return [pair.join(':'), pair] as const;
                })
        ).values()
    ];
    const linked = groupBy(links.flatMap(([a, b]) => [[a, b] as const, [b, a] as const]));
    const adjacent = groupBy(
        links.flatMap((link) => {
            const [start, end] = link.map((code) => column.get(code)!);
            return end - start === 1 ? [[start, link] as const] : [];
        })
    );
    const rows = new Map<string, number>();
    const place = (blocksOfColumn: Block[]) =>
        blocksOfColumn.flat().forEach((subject, row) => rows.set(subject.code, row));
    // fileiras ocupadas pelos semestres no meio de cada ligação, que impedem a linha reta
    const sizes = groupBy(model.subjects.map((subject) => [subject.period, subject.code] as const));
    const covered = links.map(([a, b]) =>
        Math.max(
            0,
            ...model.periods
                .filter((period) => period > column.get(a)! && period < column.get(b)!)
                .map((period) => sizes.get(period)?.length ?? 0)
        )
    );
    function cost() {
        let total = 0;
        links.forEach(([a, b], index) => {
            const distance = Math.abs(rows.get(a)! - rows.get(b)!);
            total += distance || (rows.get(a)! < covered[index] ? BLOCKED : 0);
        });
        for (const group of adjacent.values())
            for (let i = 0; i < group.length; i++)
                for (let j = i + 1; j < group.length; j++) {
                    const [a, b] = group[i];
                    const [c, d] = group[j];
                    if ((rows.get(a)! - rows.get(c)!) * (rows.get(b)! - rows.get(d)!) < 0)
                        total += CROSSING;
                }
        return total;
    }

    const columns: Columns = model.periods.map((period) => blocks(model, period));
    columns.forEach(place);
    let best = { cost: Infinity, columns };
    const remember = () => {
        const value = cost();
        if (value < best.cost) best = { cost: value, columns: columns.map((c) => c.slice()) };
    };

    // baricentro: cada bloco vai para a média das fileiras ligadas do lado já ordenado
    for (let sweep = 0; sweep < SWEEPS; sweep++) {
        const forward = sweep % 2 === 0;
        const order = forward ? columns.keys() : [...columns.keys()].toReversed();
        for (const index of order) {
            const period = model.periods[index];
            const key = (block: Block) => {
                const ends = block.flatMap(({ code }) =>
                    (linked.get(code) ?? [])
                        .filter((other) =>
                            forward ? column.get(other)! < period : column.get(other)! > period
                        )
                        .map((other) => rows.get(other)!)
                );
                const top = rows.get(block[0].code)!;
                return ends.length ? ends.reduce((a, b) => a + b, 0) / ends.length : top;
            };
            const keys = new Map(columns[index].map((block) => [block, key(block)]));
            columns[index].sort((a, b) => keys.get(a)! - keys.get(b)!);
            place(columns[index]);
        }
        remember();
    }

    // refinamento: leva cada bloco para a posição do semestre com a melhor nota
    columns.splice(0, columns.length, ...best.columns.map((c) => c.slice()));
    columns.forEach(place);
    let current = cost();
    for (let round = 0, improved = true; improved && round < SWAP_ROUNDS; round++) {
        improved = false;
        for (const blocksOfColumn of columns)
            for (const block of blocksOfColumn.slice()) {
                const from = blocksOfColumn.indexOf(block);
                let target = from;
                blocksOfColumn.splice(from, 1);
                for (let to = 0; to <= blocksOfColumn.length; to++) {
                    if (to === from) continue;
                    blocksOfColumn.splice(to, 0, block);
                    place(blocksOfColumn);
                    const value = cost();
                    if (value < current) {
                        current = value;
                        target = to;
                        improved = true;
                    }
                    blocksOfColumn.splice(to, 1);
                }
                blocksOfColumn.splice(target, 0, block);
                place(blocksOfColumn);
            }
    }
    const result = columns.map((blocksOfColumn) => blocksOfColumn.flat());
    cache.set(model, result);
    return result;
}
