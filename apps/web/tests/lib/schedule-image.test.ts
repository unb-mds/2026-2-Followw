import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

import { createSchedulePng } from '#/lib/schedule-image';

import { useDom } from '../helpers/dom';

useDom();
afterEach(() => mock.restore());

const items = [
    {
        code: 'FGA0108',
        name: 'Matemática Discreta 2',
        classroom: { semester: '2026.2', number: '01', schedule: '35T23' }
    }
];

function canvasMock(blob: Blob | null = new Blob(['png'], { type: 'image/png' })) {
    const fillText = mock((_text: string, _x: number, _y: number) => {});
    const context = {
        fillText,
        fillRect: mock(() => {}),
        strokeRect: mock(() => {}),
        scale: mock(() => {}),
        measureText: (text: string) => ({ width: text.length * 10 })
    };
    const prototype = Object.getPrototypeOf(document.createElement('canvas'));
    spyOn(prototype, 'getContext').mockReturnValue(context);
    const encode = spyOn(prototype, 'toBlob').mockImplementation((callback: BlobCallback) =>
        callback(blob)
    );
    return { fillText, encode };
}

describe('exportação da grade em PNG', () => {
    test('exporta tabela completa, semestre e legenda com nome da matéria', async () => {
        const { fillText, encode } = canvasMock();
        const result = await createSchedulePng(items);
        expect(result.type).toBe('image/png');
        expect(encode.mock.calls[0][1]).toBe('image/png');
        const texts = fillText.mock.calls.map((call) => call[0]);
        for (const text of [
            'Semestre 2026.2',
            'Seg',
            'Sáb',
            '14:00–14:55',
            '14:55–15:50',
            'FGA0108',
            'T01',
            'FGA0108 · Matemática Discreta 2 · Turma 01 · 2026.2'
        ])
            expect(texts).toContain(text);
    });

    test('inclui matérias sem horário e semestres distintos na mesma imagem', async () => {
        const { fillText } = canvasMock();
        await createSchedulePng([
            ...items,
            { ...items[0], classroom: { semester: '2027.1', number: '02', schedule: '' } }
        ]);
        const texts = fillText.mock.calls.map((call) => call[0]);
        expect(texts).toContain('Semestre 2027.1');
        expect(texts.some((text) => text.includes('Horário a definir'))).toBe(true);
    });

    test('informa falha quando o navegador não consegue codificar o PNG', () => {
        canvasMock(null);
        expect(createSchedulePng(items)).rejects.toThrow('Não foi possível gerar o PNG.');
    });
});
