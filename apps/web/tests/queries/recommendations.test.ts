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

test('recomendações aparecem apenas para graduação sem pesquisa e filtros', async () => {
    const { showRecommendations } = await import('#/queries/recommendations');
    const search = { q: '', turno: 'Todos', disponibilidade: 'Todas' };
    const student = { level: 'Graduação' };
    expect(showRecommendations(student, search)).toBe(true);
    expect(showRecommendations(null, search)).toBe(false);
    expect(showRecommendations({ level: 'Mestrado' }, search)).toBe(false);
    expect(showRecommendations(student, { ...search, q: 'MAT0025' })).toBe(false);
    expect(showRecommendations(student, { ...search, turno: 'Noite' })).toBe(false);
    expect(showRecommendations(student, { ...search, disponibilidade: 'Disponíveis' })).toBe(false);
});
