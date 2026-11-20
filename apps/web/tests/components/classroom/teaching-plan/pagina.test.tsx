import { describe, expect, test } from 'bun:test';

import { createPlanRouter, useTeachingPlan } from './helpers';

describe('página e acesso ao plano de ensino', () => {
    const { dom, renderPage, renderLink } = useTeachingPlan();

    test('matéria é o título da página, com código, turma e semestre', () => {
        const page = renderPage();
        expect(
            page.getByRole('heading', { level: 1, name: 'MATEMÁTICA DISCRETA 2' })
        ).toBeDefined();
        expect(page.getByText('FGA0108')).toBeDefined();
        expect(page.getByText(/Turma 02 · 2026\.2/)).toBeDefined();
        expect(page.getByText('Plano de ensino', { selector: 'p' })).toBeDefined();
    });

    test('página segue a estrutura de artigo com retorno à turma', () => {
        const page = renderPage();
        expect(page.getByRole('main')).toBeDefined();
        expect(page.getByRole('article', { name: 'Plano de ensino' })).toBeDefined();
        expect(page.getByRole('link', { name: 'Voltar à turma' }).getAttribute('href')).toBe(
            '/turmas/AAA'
        );
        expect(page.queryByRole('tablist')).toBeNull();
    });

    test('voltar à turma desfaz a navegação em vez de empilhar a turma de novo', async () => {
        const router = createPlanRouter(['/turmas', '/turmas/AAA', '/turmas/AAA/plano-de-ensino']);
        await router.load();
        const { fireEvent, waitFor } = dom.testing;
        const page = renderPage(undefined, router);
        fireEvent.click(page.getByRole('link', { name: 'Voltar à turma' }));

        await waitFor(() => expect(router.history.location.pathname).toBe('/turmas/AAA'));
        expect(router.history.canGoBack()).toBe(true);
        router.history.back();
        await waitFor(() => expect(router.history.location.pathname).toBe('/turmas'));
    });

    test('plano congelado não oferece atualização', () => {
        const page = renderPage();
        expect(page.queryByRole('button', { name: /atualizar/i })).toBeNull();
    });

    test('acesso aponta para a página própria do plano', () => {
        const page = renderLink();
        const link = page.getByRole('link', { name: 'Plano de ensino' });
        expect(link.getAttribute('href')).toBe('/turmas/AAA/plano-de-ensino');
        expect(link.querySelectorAll('svg')).toHaveLength(1);
    });
});
