import { describe, expect, test } from 'bun:test';

import { PLAN, useTeachingPlan } from './helpers';

describe('conteúdo do plano de ensino', () => {
    const { state, dom, render } = useTeachingPlan();

    test('mostra opção antes dos filtros e só expande ao abrir', async () => {
        const page = render();
        const trigger = await page.findByRole('button', { name: 'Plano de ensino' });
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(page.queryByRole('heading', { name: 'Metodologia' })).toBeNull();
        expect(
            trigger.compareDocumentPosition(page.getByRole('button', { name: 'Todas' })) & 4
        ).toBe(4);
        dom.testing.fireEvent.click(trigger);
        expect(await page.findByRole('heading', { name: 'Metodologia' })).toBeDefined();
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

    test('recolhe e reabre o plano mantendo o estado do controle e do painel', async () => {
        const page = render();
        const trigger = await page.findByRole('button', { name: 'Plano de ensino' });
        for (let cycle = 0; cycle < 3; cycle++) {
            dom.testing.fireEvent.click(trigger);
            expect(trigger.getAttribute('aria-expanded')).toBe('true');
            expect(page.getByRole('heading', { name: 'Metodologia' })).toBeDefined();
            expect(
                page.getByRole('region', { name: 'Plano de ensino' }).hasAttribute('data-open')
            ).toBe(true);
            dom.testing.fireEvent.click(trigger);
            expect(trigger.getAttribute('aria-expanded')).toBe('false');
            const panel = page.queryByRole('region', { name: 'Plano de ensino' });
            if (panel) expect(panel.hasAttribute('data-closed')).toBe(true);
        }
        expect(page.getByRole('button', { name: 'Todas' }).getAttribute('aria-pressed')).toBe(
            'true'
        );
    });

    test('mantém datas locais, ordem e referências repetidas nas duas apresentações', async () => {
        const page = render();
        dom.testing.fireEvent.click(await page.findByRole('button', { name: 'Plano de ensino' }));
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
        dom.testing.fireEvent.click(await page.findByRole('button', { name: 'Plano de ensino' }));
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

    test('plano não entra nos filtros de postagem', async () => {
        const page = render();
        await page.findByRole('button', { name: 'Plano de ensino' });
        dom.testing.fireEvent.click(page.getByRole('button', { name: 'Materiais' }));
        expect(page.getByRole('button', { name: 'Plano de ensino' })).toBeDefined();
        expect(page.getByText('Nenhuma postagem deste tipo.')).toBeDefined();
    });
});
