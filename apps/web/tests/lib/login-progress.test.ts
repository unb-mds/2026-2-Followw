import { describe, expect, test } from 'bun:test';

import { loginProgressAt } from '#/lib/login-progress';

describe('loginProgressAt', () => {
    test('avança rápido e se aproxima de 90% em quatro segundos', () => {
        expect(loginProgressAt(0)).toBe(0);
        expect(loginProgressAt(1000)).toBeGreaterThan(40);
        expect(loginProgressAt(4000)).toBeGreaterThan(87);
        expect(loginProgressAt(4000)).toBeLessThan(90);
    });

    test('desacelera e nunca indica conclusão enquanto a requisição continua', () => {
        const firstSecond = loginProgressAt(1000);
        const secondSecond = loginProgressAt(2000) - loginProgressAt(1000);
        const thirdSecond = loginProgressAt(3000) - loginProgressAt(2000);
        const fourthSecond = loginProgressAt(4000) - loginProgressAt(3000);

        expect(firstSecond).toBeGreaterThan(secondSecond);
        expect(secondSecond).toBeGreaterThan(thirdSecond);
        expect(thirdSecond).toBeGreaterThan(fourthSecond);
        expect(loginProgressAt(60000)).toBeLessThan(100);
        expect(loginProgressAt(Infinity)).toBeLessThan(100);
    });
});
