import { expect, test } from 'bun:test';

import { profileEditRefusal } from '../../../src/lib/profile.ts';
import { ApiError } from '../../../src/queries/errors.ts';

const apiError = (status: number, detail: unknown = null) => new ApiError(status, detail);

test('pede para aguardar quando há tentativas demais', () => {
    expect(profileEditRefusal(apiError(429))).toBe(
        'Muitas tentativas. Aguarde um pouco e tente novamente.'
    );
});

test('mostra o motivo da API para foto grande ou dado inválido', () => {
    expect(profileEditRefusal(apiError(413, 'Foto muito grande.'))).toBe('Foto muito grande.');
    expect(profileEditRefusal(apiError(422, [{ msg: 'x' }]))).toBe(
        'Confira os dados e tente novamente.'
    );
});

test('falhas sem motivo próprio ficam com a mensagem genérica de quem chama', () => {
    expect(profileEditRefusal(apiError(500))).toBeNull();
    expect(profileEditRefusal(new TypeError('offline'))).toBeNull();
});
