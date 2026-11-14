import type { components } from './schema.gen.ts';

import { api } from './api.ts';

export type InternshipItem = components['schemas']['InternshipItem'];
export type InternshipDetail = components['schemas']['InternshipDetail'];

export const internshipsQueryOptions = api.queryOptions(
    'get',
    '/me/internships',
    {},
    {
        staleTime: 5 * 60_000
    }
);

const lookupKey = (text: string) => text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');

export function filterInternships(items: InternshipItem[], text: string | null) {
    const terms = lookupKey(text ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (!terms.length) return items;
    return items.filter(({ title }) => {
        const key = lookupKey(title);
        return terms.every((term) => key.includes(term));
    });
}

export const internshipDetailQueryOptions = (reference: string) =>
    api.queryOptions(
        'get',
        '/me/internships/{reference}',
        { params: { path: { reference } } },
        { staleTime: 5 * 60_000, gcTime: 10 * 60_000 }
    );
