import { expect, test } from 'bun:test';

import { safeLoginReturn } from '#/lib/login-return';

test.each([
    'https://intruso.test',
    '//intruso.test',
    '/a/..//intruso.test',
    '/a/%2e%2e//intruso.test',
    '/\\intruso.test',
    '/login',
    '/login/',
    '/lo%67in/',
    '/x\n',
    null
])('recusa retorno inseguro %s', (value) => {
    expect(safeLoginReturn(value)).toBe('/perfil');
});
test('preserva caminho e parâmetros do consentimento', () => {
    const path = '/autorizar?client_id=app&state=000123&redirect_uri=https%3A%2F%2Fapp.test';
    expect(safeLoginReturn(path)).toBe(path);
});

test.each(['000123', '{"id":1}', 'a+b & c'])(
    'preserva state opaco %s ao navegar',
    async (state) => {
        const { parseRouterSearch, stringifyRouterSearch } = await import('#/lib/search-params');
        const query = new URLSearchParams({ state }).toString();
        expect(
            new URLSearchParams(stringifyRouterSearch(parseRouterSearch(query))).get('state')
        ).toBe(state);
    }
);

test('a busca do login troca retorno inseguro pelo padrão', async () => {
    const { validateLoginSearch } = await import('#/lib/login-return');
    const { validate } = validateLoginSearch['~standard'];
    expect(validate({ returnTo: '//intruso.test' })).toEqual({ value: { returnTo: '/perfil' } });
    expect(validate({ returnTo: '/turmas' })).toEqual({ value: { returnTo: '/turmas' } });
});
