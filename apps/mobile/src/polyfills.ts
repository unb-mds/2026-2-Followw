// ES2023 que o Hermes ainda não tem e o código compartilhado com o web usa
/* oxlint-disable unicorn/no-array-sort, unicorn/no-array-reverse, typescript/no-unsafe-type-assertion -- o polyfill implementa esses métodos */
const array = Array.prototype as unknown as Record<string, unknown>;

if (!array.toSorted) {
    array.toSorted = function <T>(this: T[], compare?: (a: T, b: T) => number) {
        return [...this].sort(compare);
    };
}

if (!array.toReversed) {
    array.toReversed = function <T>(this: T[]) {
        return [...this].reverse();
    };
}

if (!array.toSpliced) {
    array.toSpliced = function <T>(this: T[], start: number, deleteCount?: number, ...items: T[]) {
        const copy = [...this];
        if (deleteCount === undefined) copy.splice(start);
        else copy.splice(start, deleteCount, ...items);
        return copy;
    };
}

if (!array.with) {
    array.with = function <T>(this: T[], index: number, value: T) {
        const copy = [...this];
        copy[index < 0 ? copy.length + index : index] = value;
        return copy;
    };
}
