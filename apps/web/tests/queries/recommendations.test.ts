import { expect, test } from 'bun:test';

test('recomendações aparecem só para graduação e sem pesquisa', async () => {
    const { showRecommendations } = await import('@followw/core/queries/recommendations.ts');
    const student = { level: 'Graduação' };
    expect(showRecommendations(student, { q: '' })).toBe(true);
    expect(showRecommendations(student, { q: '  ' })).toBe(true);
    expect(showRecommendations(null, { q: '' })).toBe(false);
    expect(showRecommendations({ level: 'Mestrado' }, { q: '' })).toBe(false);
    expect(showRecommendations(student, { q: 'MAT0025' })).toBe(false);
});
