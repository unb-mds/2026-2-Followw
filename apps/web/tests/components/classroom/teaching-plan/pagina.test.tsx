import { describe, expect, test } from 'bun:test';

import { useTeachingPlan } from './helpers';

describe('página e acesso ao plano de ensino', () => {
    const { renderPage, renderLink } = useTeachingPlan();

    test('página segue a estrutura de artigo com retorno à turma', () => {
        const page = renderPage();
        expect(page.getByRole('main')).toBeDefined();
        expect(page.getByRole('article', { name: 'Plano de ensino' })).toBeDefined();
        expect(page.getByRole('heading', { level: 1, name: 'Plano de ensino' })).toBeDefined();
        expect(page.getByRole('link', { name: 'Voltar à turma' }).getAttribute('href')).toBe(
            '/turmas/AAA'
        );
        expect(page.getByText('Matemática Discreta 2')).toBeDefined();
        expect(page.queryByRole('tablist')).toBeNull();
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
