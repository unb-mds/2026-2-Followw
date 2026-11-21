import { describe, expect, test } from 'bun:test';

import { PLAN, useTeachingPlan } from './helpers';

describe('conteúdo do plano de ensino', () => {
    const { renderPage } = useTeachingPlan();

    test('mostra o conteúdo do plano num artigo', () => {
        const page = renderPage();
        expect(page.getByRole('article', { name: 'Plano de ensino' })).toBeDefined();
        expect(page.getByText('práticas').tagName).toBe('STRONG');
        expect(page.getByRole('link', { name: 'Leitura' }).getAttribute('rel')).toContain(
            'noopener'
        );
        expect(page.getByRole('table', { name: 'Cronograma de aulas' })).toBeDefined();
        expect(page.getByRole('list', { name: 'Cronograma de aulas' })).toBeDefined();
        expect(page.getByRole('columnheader', { name: 'Tema' })).toBeDefined();
        expect(page.queryByRole('heading', { name: 'Horário de atendimento' })).toBeNull();
        expect(page.queryByRole('heading', { name: 'Referências complementares' })).toBeNull();
    });

    test('mantém datas locais, ordem e referências repetidas nas duas apresentações', () => {
        const page = renderPage();
        const desktop = page.getByRole('table', { name: 'Cronograma de aulas' });
        const mobile = page.getByRole('list', { name: 'Cronograma de aulas' });
        for (const view of [desktop, mobile]) {
            expect(view.textContent?.indexOf('03/11/2026')).toBeLessThan(
                view.textContent?.indexOf('11/08/2026') ?? 0
            );
            expect(view.textContent).toContain('Material A3');
        }
        for (const view of [
            page.getByRole('table', { name: 'Referências básicas' }),
            page.getByRole('list', { name: 'Referências básicas' })
        ])
            expect(view.textContent?.match(/Introdução à Álgebra\./g)).toHaveLength(2);
    });

    test('omite seções e campos sem conteúdo sem acrescentar informações', () => {
        const page = renderPage({
            ...PLAN,
            methodology: null,
            assessment_procedures: null,
            schedule: [],
            assessments: [],
            basic_references: [{ material_type: null, description: 'Livro indicado.' }]
        });
        expect(page.getByRole('heading', { name: 'Referências básicas' })).toBeDefined();
        for (const title of [
            'Metodologia',
            'Critérios de avaliação',
            'Cronograma de aulas',
            'Avaliações'
        ])
            expect(page.queryByRole('heading', { name: title })).toBeNull();
        expect(page.queryByText('Não informado')).toBeNull();
        expect(
            page.getByRole('list', { name: 'Referências básicas' }).querySelector('dt')?.textContent
        ).toBe('Descrição');
    });
});
