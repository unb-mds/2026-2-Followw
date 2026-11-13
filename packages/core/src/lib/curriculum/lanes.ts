export interface PortSpan {
    id: string;
    start: number;
    end: number;
}

export function portLanes(spans: PortSpan[], clearance: number) {
    const merged = new Map<string, PortSpan>();
    for (const span of spans) {
        const existing = merged.get(span.id);
        merged.set(span.id, {
            id: span.id,
            start: Math.min(span.start, span.end, existing?.start ?? Infinity),
            end: Math.max(span.start, span.end, existing?.end ?? -Infinity)
        });
    }
    const ends: number[] = [];
    const lanes = new Map<string, number>();
    for (const span of [...merged.values()].toSorted(
        (a, b) => a.start - b.start || a.id.localeCompare(b.id)
    )) {
        let lane = ends.findIndex((end) => end + clearance < span.start);
        if (lane === -1) lane = ends.length;
        ends[lane] = span.end;
        lanes.set(span.id, lane);
    }
    return { lanes, count: ends.length };
}
