import { QueryClient } from '@tanstack/react-query';
import { expect, test } from 'bun:test';

import { shouldPersistQuery } from '#/integrations/offline/storage';
import { recommendationsQueryOptions } from '#/queries/recommendations';

test('recomendações não são gravadas no cache offline; catálogo continua persistido', () => {
    const client = new QueryClient();
    client.setQueryData(recommendationsQueryOptions.queryKey, { items: [] });
    client.setQueryData(['get', '/public/subjects'], []);
    expect(
        shouldPersistQuery(
            client.getQueryCache().find({ queryKey: recommendationsQueryOptions.queryKey })!
        )
    ).toBe(false);
    expect(
        shouldPersistQuery(client.getQueryCache().find({ queryKey: ['get', '/public/subjects'] })!)
    ).toBe(true);
    client.clear();
});

test('recomendações aparecem só para graduação e sem pesquisa', async () => {
    const { showRecommendations } = await import('#/queries/recommendations');
    const student = { level: 'Graduação' };
    expect(showRecommendations(student, { q: '' })).toBe(true);
    expect(showRecommendations(student, { q: '  ' })).toBe(true);
    expect(showRecommendations(null, { q: '' })).toBe(false);
    expect(showRecommendations({ level: 'Mestrado' }, { q: '' })).toBe(false);
    expect(showRecommendations(student, { q: 'MAT0025' })).toBe(false);
});
