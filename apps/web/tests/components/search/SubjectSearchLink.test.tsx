import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { SubjectSearchLink } from '#/components/search/SubjectSearchLink';
import { subjectsQuery } from '#/queries/subjects';

test('nome longo e acentuado gera pesquisa válida sem perder o rótulo completo', () => {
    const name = 'MÉTODOS DE DESENVOLVIMENTO DE SOFTWARE';
    const markup = renderToStaticMarkup(<SubjectSearchLink query={name}>{name}</SubjectSearchLink>);
    const href = markup.match(/href="([^"]+)"/)![1];
    const url = new URL(href, 'http://localhost');
    const query = url.searchParams.get('q')!;
    expect(query).toBe(name);
    expect(subjectsQuery(query, null)).toEqual({ q: query });
    expect(markup).toContain(name);
    expect([...url.searchParams.keys()]).toEqual(['q']);
});

test('maior nome do catálogo cabe por inteiro na pesquisa', () => {
    const name =
        'CENÁRIOS E PRÁTICAS EM TERAPIA OCUPACIONAL EM CONTEXTOS HOSPITALARES E CUIDADOS PALIATIVOS';
    expect(name).toHaveLength(90);
    const markup = renderToStaticMarkup(<SubjectSearchLink query={name}>{name}</SubjectSearchLink>);
    const href = markup.match(/href="([^"]+)"/)![1];
    const query = new URL(href, 'http://localhost').searchParams.get('q')!;
    expect(query).toBe(name);
    expect(subjectsQuery(query, null)).toEqual({ q: name });
});
