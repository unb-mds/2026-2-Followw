import type { components } from './schema.gen.ts';

import { api } from './api.ts';

export type InternshipItem = components['schemas']['InternshipItem'];
export type InternshipDetail = components['schemas']['InternshipDetail'];

export const internshipsQueryOptions = (q?: string | null) =>
    api.queryOptions(
        'get',
        '/me/internships',
        { params: { query: { q: q || undefined } } },
        { staleTime: 5 * 60_000, gcTime: 10 * 60_000 }
    );

export const internshipDetailQueryOptions = (reference: string) =>
    api.queryOptions(
        'get',
        '/me/internships/{reference}',
        { params: { path: { reference } } },
        { staleTime: 5 * 60_000, gcTime: 10 * 60_000 }
    );
