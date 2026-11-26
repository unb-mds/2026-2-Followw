import type { components } from './schema.gen.ts';

import { plural } from '../lib/plural.ts';
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

export function formatInternshipMoney(value: string | number | null | undefined): string | null {
    if (!value) return null;
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num) || num === 0) return null;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// o SIGAA manda a data sem fuso, já no calendário da UnB: o fuso do aparelho não pode mudar o dia
export function formatInternshipDate(isoString: string): string {
    const [year, month, day] = isoString.slice(0, 10).split('-');
    return day && month && year ? `${day}/${month}/${year}` : isoString;
}

export const vacanciesLabel = (count: number) => plural(count, 'vaga', 'vagas');
