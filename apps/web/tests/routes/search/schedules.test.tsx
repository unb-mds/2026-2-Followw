import { expect, test } from 'bun:test';

import { describeSearchPage } from '../../helpers/search-page';

describeSearchPage('Busca por horário', (fixture) => {
    test('trata horários digitados como texto', async () => {
        const page = fixture.renderPage('?q=segunda+10h');
        await fixture.testing.waitFor(() => expect(fixture.requests).toHaveLength(1));
        expect(fixture.requests[0].searchParams.get('q')).toBe('segunda 10h');
        expect(fixture.requests[0].searchParams.has('type')).toBe(false);

        fixture.testing.fireEvent.change(fixture.searchbox(page), { target: { value: '10:00' } });
        await fixture.testing.waitFor(() => expect(fixture.requests).toHaveLength(2));
        expect(fixture.requests[1].searchParams.get('q')).toBe('10:00');
        expect(fixture.requests[1].pathname).toBe('/api/public/search');
    });

    test('digitar código SIGAA consulta as turmas e mostra o horário', async () => {
        fixture.scheduleResults.set('24M34', [
            {
                code: 'FIS0123',
                name: 'Física Aplicada',
                classrooms: [
                    { number: '01', semester: '2026.2', schedule: '24M34', professors: [] }
                ]
            }
        ]);
        const page = fixture.renderPage();
        fixture.testing.fireEvent.change(fixture.searchbox(page), { target: { value: '24M34' } });
        fixture.testing.fireEvent.click(
            await page.findByRole('button', { name: /Física Aplicada/ })
        );
        expect(await page.findByText('Seg, Qua · 10:00–11:50')).toBeDefined();
        expect(fixture.requests[0].pathname).toBe('/api/public/search');
        expect(fixture.requests[0].searchParams.get('q')).toBe('24M34');
    });
});
