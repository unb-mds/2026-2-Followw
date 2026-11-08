const array = Array.prototype as unknown as Record<string, unknown>;
const NAMES = ['toSorted', 'toReversed', 'toSpliced', 'with'];
const native = Object.fromEntries(NAMES.map((name) => [name, array[name]]));

beforeAll(() => {
    for (const name of NAMES) delete array[name];
    jest.isolateModules(() => require('@/polyfills'));
});

afterAll(() => Object.assign(array, native));

test('polyfills copiam o array sem alterar o original', () => {
    const list = [3, 1, 2] as number[] & Record<string, (...args: unknown[]) => number[]>;
    expect(list.toSorted((a: unknown, b: unknown) => Number(a) - Number(b))).toEqual([1, 2, 3]);
    expect(list.toReversed()).toEqual([2, 1, 3]);
    expect(list.toSpliced(1, 1, 9)).toEqual([3, 9, 2]);
    expect(list.toSpliced(1)).toEqual([3]);
    expect(list.with(2, 7)).toEqual([3, 1, 7]);
    expect(list).toEqual([3, 1, 2]);
});
