import { expect, test } from 'bun:test';

import { ACCOUNT_KEYS, STORAGE_KEYS } from '../../src/lib/storage-keys.ts';

test('a troca de conta apaga os dados do aluno, mas mantém o tema', () => {
    expect(ACCOUNT_KEYS).not.toContain(STORAGE_KEYS.THEME);
    expect(new Set(ACCOUNT_KEYS)).toEqual(
        new Set(Object.values(STORAGE_KEYS).filter((key) => key !== STORAGE_KEYS.THEME))
    );
});
