import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

import { createSchedulePng } from '#/lib/schedule-image';

import { useDom } from '../helpers/dom';

useDom();
afterEach(() => mock.restore());

const items = [
    {
        code: 'FGA0108',
        name: 'Matemática Discreta 2',
        classroom: {
            semester: '2026.2',
            number: '01',
            schedule: '35T23',
            room: 'FCTE - I2',
            professors: ['LINDOMAR DE JESUS']
        }
    }
];

function canvasMock(blob: Blob | null = new Blob(['png'], { type: 'image/png' })) {
    const fillText = mock((_text: string, _x: number, _y: number) => {});
    const context = {
        fillText,
        fillRect: mock(() => {}),
        strokeRect: mock(() => {}),
        scale: mock(() => {}),
        save: mock(() => {}),
        restore: mock(() => {}),
        clip: mock(() => {}),
        beginPath: mock(() => {}),
        roundRect: mock(() => {}),
        fill: mock(() => {}),
        stroke: mock(() => {}),
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
    test('exporta título do semestre, tabela, cards das turmas e o site', async () => {
        const { fillText, encode } = canvasMock();
        const result = await createSchedulePng(items);
        expect(result.type).toBe('image/png');
        expect(encode.mock.calls[0][1]).toBe('image/png');
        const texts = fillText.mock.calls.map((call) => call[0]);
        for (const text of [
            'Minha grade · 2026.2',
            'Seg',
            'Sáb',
            '14:00–14:55',
            '14:55–15:50',
            'FGA0108',
            'T01',
            'FGA0108 · T01',
            'Ter, Qui · 14:00–15:50',
            'Matemática Discreta 2',
            'FCTE - I2 · LINDOMAR DE JESUS',
            'followw.app'
        ])
            expect(texts).toContain(text);
        expect(texts).not.toContain('Semestre 2026.2');
    });

    test('inclui matérias sem horário e semestres distintos na mesma imagem', async () => {
        const { fillText } = canvasMock();
        await createSchedulePng([
            ...items,
            { ...items[0], classroom: { semester: '2027.1', number: '02', schedule: '' } }
        ]);
        const texts = fillText.mock.calls.map((call) => call[0]);
        expect(texts).toContain('Minha grade · 2027.1');
        expect(texts).toContain('Horário a definir');
    });

    test('corta textos longos com reticências', async () => {
        const { fillText } = canvasMock();
        await createSchedulePng([{ ...items[0], name: 'A'.repeat(200) }]);
        const name = fillText.mock.calls
            .map((call) => call[0])
            .find((text) => text.startsWith('AAA'));
        expect(name?.endsWith('…')).toBe(true);
        expect(name!.length).toBeLessThan(200);
    });

    test('informa falha quando o navegador não consegue codificar o PNG', () => {
        canvasMock(null);
        expect(createSchedulePng(items)).rejects.toThrow('Não foi possível gerar o PNG.');
    });
});
