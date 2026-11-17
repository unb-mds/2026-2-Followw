import { describe, expect, test } from 'bun:test';

import { PLAN, useTeachingPlan } from './helpers';

describe('conteúdo do plano de ensino', () => {
    const { state, render } = useTeachingPlan();

    test('mostra o conteúdo diretamente em artigo, sem Accordion', async () => {
        const page = render();
        expect(await page.findByRole('article', { name: 'Plano de ensino' })).toBeDefined();
        expect(page.queryByRole('button', { name: 'Plano de ensino' })).toBeNull();
        expect(page.getByText('práticas').tagName).toBe('STRONG');
        expect(page.getByRole('link', { name: 'Leitura' }).getAttribute('rel')).toContain(
            'noopener'
        );
        expect(page.getByRole('table', { name: 'Cronograma de aulas' })).toBeDefined();
        expect(page.getByRole('list', { name: 'Cronograma de aulas' })).toBeDefined();
        expect(page.getByText('Tema').tagName).toBe('TH');
        expect(page.queryByRole('heading', { name: 'Horário de atendimento' })).toBeNull();
        expect(page.queryByRole('heading', { name: 'Referências complementares' })).toBeNull();
        expect(state.requests.filter((r) => r.url.endsWith('/teaching-plan'))).toHaveLength(1);
    });

    test('mantém datas locais, ordem e referências repetidas nas duas apresentações', async () => {
        const page = render();
        await page.findByRole('article', { name: 'Plano de ensino' });
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

    test('omite seções e campos sem conteúdo sem acrescentar informações', async () => {
        state.plans.AAA = {
            ...PLAN,
            methodology: null,
            assessment_procedures: null,
            schedule: [],
            assessments: [],
            basic_references: [{ material_type: null, description: 'Livro indicado.' }]
        };
        const page = render();
        await page.findByRole('article', { name: 'Plano de ensino' });
        expect(await page.findByRole('heading', { name: 'Referências básicas' })).toBeDefined();
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
