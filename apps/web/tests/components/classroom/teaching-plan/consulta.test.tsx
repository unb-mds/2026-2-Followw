import { classroomTeachingPlanQueryOptions } from '@followw/core/queries/classrooms.ts';
import { describe, expect, test } from 'bun:test';

import { PLAN, useTeachingPlan } from './helpers';

describe('página e acesso ao plano de ensino', () => {
    const { state, dom, render } = useTeachingPlan();

    test('página sem plano retorna a Postagens sem exibir conteúdo', async () => {
        const page = render('BBB');
        await dom.testing.waitFor(() =>
            expect(state.router.state.location.href).toBe('/turmas/BBB?tab=posts')
        );
        expect(page.queryByText(/plano de ensino/i)).toBeNull();
        expect(page.queryByRole('article')).toBeNull();
    });

    test('plano retirado durante atualização retorna à turma em vez de deixar tela vazia', async () => {
        const page = render();
        await page.findByRole('article');
        state.plans.AAA = null;
        dom.testing.fireEvent.click(
            page.getByRole('button', { name: 'Atualizar plano de ensino' })
        );
        await dom.testing.waitFor(() =>
            expect(state.router.state.location.href).toBe('/turmas/AAA?tab=posts')
        );
        expect(page.queryByRole('article')).toBeNull();
    });

    test('falha permite nova tentativa', async () => {
        state.failPlan = true;
        const page = render();
        await page.findByText('Não foi possível consultar o plano de ensino.');
        state.failPlan = false;
        dom.testing.fireEvent.click(page.getByRole('button', { name: 'Tentar novamente' }));
        expect(await page.findByRole('article')).toBeDefined();
    });

    test('falha preserva o plano salvo', async () => {
        state.client.setQueryData(classroomTeachingPlanQueryOptions('AAA').queryKey, PLAN);
        state.failPlan = true;
        const page = render();
        dom.testing.fireEvent.click(
            page.getByRole('button', { name: 'Atualizar plano de ensino' })
        );
        await page.findByText(
            'Não foi possível atualizar o plano de ensino. Exibindo os dados salvos.'
        );
        expect(page.getByRole('article')).toBeDefined();
    });

    test('plano automático lento não desabilita atualizar postagens e a atualização aguarda sua conclusão', async () => {
        const pending = Promise.withResolvers<void>();
        state.pendingPlan = pending.promise;
        const page = render('AAA', true);
        try {
            await page.findByRole('button', { name: /Aviso da turma/ });
            await dom.testing.waitFor(() => expect(state.requests).toHaveLength(2));
            const button = page.getByRole('button', { name: 'Atualizar' });
            expect(button.hasAttribute('disabled')).toBe(false);
            expect(page.queryByText(/plano de ensino/i)).toBeNull();
            dom.testing.fireEvent.click(button);
            await dom.testing.waitFor(() => expect(button.hasAttribute('disabled')).toBe(true));
            expect(state.requests).toHaveLength(2);
            pending.resolve();
            await dom.testing.waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
            expect(state.requests.map((r) => new URL(r.url).pathname.split('/').at(-1))).toEqual([
                'posts',
                'teaching-plan',
                'posts',
                'teaching-plan'
            ]);
        } finally {
            pending.resolve();
        }
    });

    test('botão de acesso fica antes dos filtros, sem seta, e aponta para página própria', async () => {
        const page = render('AAA', true);
        const link = await page.findByRole('link', { name: 'Plano de ensino' });
        expect(link.getAttribute('href')).toBe('/turmas/AAA/plano-de-ensino');
        expect(link.hasAttribute('aria-expanded')).toBe(false);
        expect(link.querySelectorAll('svg')).toHaveLength(1);
        expect(link.compareDocumentPosition(page.getByRole('button', { name: 'Todas' })) & 4).toBe(
            4
        );
        expect(page.queryByRole('article')).toBeNull();
        expect(page.queryByRole('tab', { name: 'Plano de ensino' })).toBeNull();
    });

    test('turma sem plano não exibe botão, carregamento ou aviso e atualizar revela plano recém-publicado', async () => {
        const page = render('BBB', true);
        const button = page.getByRole('button', { name: 'Atualizar' });
        await page.findByRole('button', { name: /Aviso da turma/ });
        await dom.testing.waitFor(() =>
            expect(
                state.client.getQueryData(classroomTeachingPlanQueryOptions('BBB').queryKey)
            ).toBeNull()
        );
        expect(page.queryByText(/plano de ensino/i)).toBeNull();
        state.plans.BBB = PLAN;
        dom.testing.fireEvent.click(button);
        expect(await page.findByRole('link', { name: 'Plano de ensino' })).toBeDefined();
        await dom.testing.waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
        state.plans.BBB = null;
        dom.testing.fireEvent.click(button);
        await dom.testing.waitFor(() =>
            expect(page.queryByRole('link', { name: 'Plano de ensino' })).toBeNull()
        );
    });

    test('página segue a estrutura de artigo com retorno a Postagens', async () => {
        const page = render();
        await page.findByRole('article');
        expect(page.getByRole('main')).toBeDefined();
        expect(page.getByRole('heading', { level: 1, name: 'Plano de ensino' })).toBeDefined();
        expect(page.getByRole('link', { name: 'Voltar à turma' }).getAttribute('href')).toBe(
            '/turmas/AAA?tab=posts'
        );
        expect(page.queryByRole('tablist')).toBeNull();
        expect(page.getByText('Matemática Discreta 2')).toBeDefined();
    });
});
