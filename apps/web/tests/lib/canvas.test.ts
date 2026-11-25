import { afterEach, expect, mock, spyOn, test } from 'bun:test';

import { ellipsize, resolvedThemeColors } from '#/lib/canvas';

import { useDom } from '../helpers/dom';

useDom();
afterEach(() => mock.restore());

const within = (max: number) => (text: string) => text.length <= max;

test('mantém o texto que cabe e corta com reticências o que não cabe', () => {
    expect(ellipsize('Cálculo 1', within(9))).toBe('Cálculo 1');
    expect(ellipsize('Cálculo 1', within(8))).toBe('Cálculo…');
    expect(ellipsize('Cálculo de uma', within(12))).toBe('Cálculo de…');
});

test('resolve o token mantendo a transparência, sem tocar em outro canvas', () => {
    const fillRect = mock();
    const prototype = Object.getPrototypeOf(document.createElement('canvas'));
    const getContext = spyOn(prototype, 'getContext').mockReturnValue({
        clearRect: mock(),
        fillRect,
        getImageData: () => ({ data: [255, 255, 255, 26] })
    });
    const color = resolvedThemeColors();
    expect(color('--border')).toBe('rgba(255, 255, 255, 0.1)');
    expect(color('--border')).toBe('rgba(255, 255, 255, 0.1)');
    expect(fillRect).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledTimes(1);
});
