import { expect, test } from 'bun:test';

import { SubjectSearchLink } from '#/components/search/SubjectSearchLink';
import { SEARCH_MAX_LENGTH, subjectsQuery } from '#/queries/subjects';

import { renderWithRouter } from '../../helpers/router';

const searchOf = (markup: string) =>
    new URL(markup.match(/href="([^"]+)"/)![1], 'http://localhost').searchParams;

test('código gera pesquisa válida mantendo o rótulo com o nome', () => {
    const name = 'MÉTODOS DE DESENVOLVIMENTO DE SOFTWARE';
    const markup = renderWithRouter(<SubjectSearchLink query="FGA0138">{name}</SubjectSearchLink>);
    const search = searchOf(markup);
    expect(search.get('q')).toBe('FGA0138');
    expect([...search.keys()]).toEqual(['q']);
    expect(subjectsQuery('FGA0138', null)).toEqual({ q: 'FGA0138' });
    expect(markup).toContain(name);
});

test('texto acima do limite é truncado para continuar pesquisável', () => {
    const professor = 'MARIA APARECIDA DOS SANTOS OLIVEIRA PEREIRA';
    const markup = renderWithRouter(
        <SubjectSearchLink query={professor}>{professor}</SubjectSearchLink>
    );
    const query = searchOf(markup).get('q')!;
    expect(query).toBe(professor.slice(0, SEARCH_MAX_LENGTH));
    expect(subjectsQuery(query, null)).toEqual({ q: query });
    expect(markup).toContain(professor);
});
