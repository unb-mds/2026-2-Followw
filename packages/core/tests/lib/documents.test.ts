import { describe, expect, test } from 'bun:test';

import { documentRefusal } from '../../src/lib/documents.ts';
import { ApiError } from '../../src/queries/errors.ts';

describe('documentRefusal', () => {
    test('repassa a mensagem da API quando o SIGAA recusa emitir a carteirinha', () => {
        const detail = 'Não foi possível emitir a carteirinha pois você não possui foto de perfil.';
        expect(documentRefusal(new ApiError(422, detail))).toBe(detail);
    });

    test.each([
        new ApiError(502, 'SIGAA is unavailable'),
        new ApiError(422, [{ msg: 'campo inválido' }]),
        new Error('falha de rede')
    ])('não trata outras falhas como recusa do SIGAA: %p', (error) => {
        expect(documentRefusal(error)).toBeNull();
    });
});
