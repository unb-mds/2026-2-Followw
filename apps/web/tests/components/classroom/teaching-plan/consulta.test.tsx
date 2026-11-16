import { classroomTeachingPlanQueryOptions } from '@followw/core/queries/classrooms.ts';
import { describe, expect, test } from 'bun:test';

import { PLAN, useTeachingPlan } from './helpers';

describe('consulta do plano na aba Postagens', () => {
    const { state, dom, render } = useTeachingPlan();

    test('ausência oculta o plano sem exibir aviso', async () => {
        const page = render('BBB');
        await dom.testing.waitFor(() =>
            expect(page.getByRole('button', { name: 'Atualizar' }).hasAttribute('disabled')).toBe(
                false
            )
        );
        expect(page.queryByText(/nenhum plano de ensino/i)).toBeNull();
        expect(page.queryByRole('button', { name: 'Plano de ensino' })).toBeNull();
        expect(page.getByRole('button', { name: /Aviso da turma/ })).toBeDefined();
    });

    test('plano pendente não bloqueia postagens', async () => {
        const pending = Promise.withResolvers<void>();
        state.pendingPlan = pending.promise;
        try {
            const page = render();
            expect(await page.findByRole('button', { name: /Aviso da turma/ })).toBeDefined();
            expect(page.getByText('Consultando plano de ensino...')).toBeDefined();
            expect(
                page.queryByText('Nenhum plano de ensino publicado para esta turma.')
            ).toBeNull();
            pending.resolve();
            expect(await page.findByRole('button', { name: 'Plano de ensino' })).toBeDefined();
        } finally {
            pending.resolve();
        }
    });

    test('falha do plano oferece nova tentativa sem bloquear postagens', async () => {
        state.failPlan = true;
        const page = render();
        expect(
            await page.findByText('Não foi possível consultar o plano de ensino.')
        ).toBeDefined();
        expect(page.getByRole('button', { name: /Aviso da turma/ })).toBeDefined();
        expect(page.queryByText('Nenhum plano de ensino publicado para esta turma.')).toBeNull();
        state.failPlan = false;
        dom.testing.fireEvent.click(page.getByRole('button', { name: 'Tentar novamente' }));
        expect(await page.findByRole('button', { name: 'Plano de ensino' })).toBeDefined();
    });

    test('postagens com falha não impedem abrir plano publicado', async () => {
        state.failPosts = true;
        const page = render();
        dom.testing.fireEvent.click(await page.findByRole('button', { name: 'Plano de ensino' }));
        expect(await page.findByRole('heading', { name: 'Metodologia' })).toBeDefined();
        expect(
            page.getByText('O SIGAA está com problemas. Tente novamente em instantes.')
        ).toBeDefined();
    });

    test('dados salvos aparecem enquanto a consulta está pendente', async () => {
        const options = classroomTeachingPlanQueryOptions('AAA');
        state.client.setQueryData(options.queryKey, PLAN);
        state.client.setQueryDefaults(options.queryKey, { staleTime: 0 });
        const pending = Promise.withResolvers<void>();
        state.pendingPlan = pending.promise;
        try {
            const page = render();
            expect(page.getByRole('button', { name: 'Plano de ensino' })).toBeDefined();
            expect(page.queryByText('Consultando plano de ensino...')).toBeNull();
            pending.resolve();
            await dom.testing.waitFor(() =>
                expect(state.client.getQueryState(options.queryKey)?.fetchStatus).toBe('idle')
            );
        } finally {
            pending.resolve();
        }
    });

    test('atualizar consulta posts e plano mesmo após ausência', async () => {
        const page = render('BBB');
        await dom.testing.waitFor(() =>
            expect(page.getByRole('button', { name: 'Atualizar' }).hasAttribute('disabled')).toBe(
                false
            )
        );
        state.plans.BBB = PLAN;
        dom.testing.fireEvent.click(page.getByRole('button', { name: 'Atualizar' }));
        expect(await page.findByRole('button', { name: 'Plano de ensino' })).toBeDefined();
        const refreshed = state.requests.slice(2);
        expect(refreshed).toHaveLength(2);
        expect(refreshed.some((r) => r.url.endsWith('/posts'))).toBe(true);
        expect(refreshed.some((r) => r.url.endsWith('/teaching-plan'))).toBe(true);
        expect(
            refreshed.every(
                (r) => r.cache === 'reload' || r.headers.get('Cache-Control') === 'no-cache'
            )
        ).toBe(true);
    });

    test('atualizar remove plano retirado da origem', async () => {
        const page = render();
        await page.findByRole('button', { name: 'Plano de ensino' });
        state.plans.AAA = null;
        dom.testing.fireEvent.click(page.getByRole('button', { name: 'Atualizar' }));
        await dom.testing.waitFor(() =>
            expect(page.getByRole('button', { name: 'Atualizar' }).hasAttribute('disabled')).toBe(
                false
            )
        );
        expect(page.queryByRole('button', { name: 'Plano de ensino' })).toBeNull();
    });

    test.each([PLAN, null])('falha ao atualizar preserva o resultado salvo %p', async (saved) => {
        state.client.setQueryData(classroomTeachingPlanQueryOptions('AAA').queryKey, saved);
        const page = render();
        await page.findByRole('button', { name: /Aviso da turma/ });
        state.failPlan = true;
        dom.testing.fireEvent.click(page.getByRole('button', { name: 'Atualizar' }));
        expect(
            await page.findByText(
                'Não foi possível atualizar o plano de ensino. Exibindo os dados salvos.'
            )
        ).toBeDefined();
        if (saved) expect(page.getByRole('button', { name: 'Plano de ensino' })).toBeDefined();
        else {
            expect(page.queryByText(/não havia plano de ensino/i)).toBeNull();
            expect(page.queryByRole('button', { name: 'Plano de ensino' })).toBeNull();
        }
    });

    test('trocar de turma não reutiliza plano de outra oferta', async () => {
        const first = render();
        await first.findByRole('button', { name: 'Plano de ensino' });
        first.unmount();
        const second = render('BBB');
        await dom.testing.waitFor(() =>
            expect(second.getByRole('button', { name: 'Atualizar' }).hasAttribute('disabled')).toBe(
                false
            )
        );
        expect(second.queryByRole('button', { name: 'Plano de ensino' })).toBeNull();
        expect(state.requests.some((r) => r.url.endsWith('/BBB/teaching-plan'))).toBe(true);
    });
});
