import { expect, test } from 'bun:test';

import { meQueryOptions } from '#/queries/me';

import { describeSearchPage, electiveStudent } from '../../helpers/search-page';

describeSearchPage('Filtros da busca', (fixture) => {
    test('pesquisa não tem filtros de turno nem barra da grade sem turmas', async () => {
        const page = fixture.renderPage('?q=calculo');
        await fixture.testing.waitFor(() => expect(page.getByText('Cálculo 1')).toBeDefined());
        expect(page.queryByRole('combobox')).toBeNull();
        expect(page.queryByRole('toolbar', { name: 'Turmas selecionadas' })).toBeNull();
    });

    test('filtro de optativas solicita login ao visitante sem consultar uma matriz', () => {
        const page = fixture.renderPage('?electives=true');
        expect(page.getByRole('link', { name: 'Entre na sua conta' }).getAttribute('href')).toBe(
            '/login'
        );
        expect(fixture.requests).toHaveLength(0);
    });

    test('consulta departamento no campo de busca', async () => {
        const page = fixture.renderPage('?category=classrooms');
        fixture.testing.fireEvent.change(fixture.searchbox(page), { target: { value: 'FCTE' } });
        await fixture.testing.waitFor(() => expect(fixture.requests).toHaveLength(1));
        expect(fixture.requests[0].pathname).toBe('/api/public/search');
        expect(fixture.requests[0].searchParams.get('q')).toBe('FCTE');
        fixture.testing.fireEvent.click(page.getByRole('button', { name: 'Filtros de matérias' }));
        expect(page.queryByLabelText('Departamento')).toBeNull();
    });

    test('combina seleções de dias, início e carga horária na busca', async () => {
        const page = fixture.renderPage('?q=calculo');
        fixture.testing.fireEvent.click(
            await page.findByRole('button', { name: 'Filtros de matérias' })
        );
        fixture.testing.fireEvent.click(await page.findByRole('button', { name: 'Seg' }));
        fixture.testing.fireEvent.click(page.getByRole('button', { name: 'Qua' }));
        fixture.testing.fireEvent.click(page.getByRole('button', { name: '08:00' }));
        fixture.testing.fireEvent.click(page.getByRole('button', { name: '10:00' }));
        fixture.testing.fireEvent.click(await page.findByRole('button', { name: '60h' }));
        fixture.testing.fireEvent.click(page.getByRole('button', { name: '90h+' }));

        const starts = fixture.testing.within(page.getByRole('group', { name: 'Hora de início' }));
        expect(starts.queryByRole('button', { name: '08:55' })).toBeNull();
        expect(page.queryByRole('group', { name: 'Hora de término' })).toBeNull();
        expect(page.queryByRole('button', { name: '180h' })).toBeNull();
        await fixture.testing.waitFor(() => {
            const params = fixture.requests.at(-1)?.searchParams;
            expect(params?.get('q')).toBe('calculo');
            expect(params?.get('days')).toBe('02');
            expect(params?.getAll('start')).toEqual(['08:00', '08:55', '10:00', '10:55']);
            expect(params?.getAll('hours')).toEqual(['60', '90+']);
        });

        fixture.testing.fireEvent.click(page.getByRole('button', { name: 'Limpar filtros' }));
        await page.findByRole('button', { name: 'Filtros de matérias' });
        expect(fixture.searchbox(page).value).toBe('calculo');
    });

    test('uma checkbox ativa e limpa o filtro de disponibilidade', async () => {
        const page = fixture.renderPage('?q=calculo');
        fixture.testing.fireEvent.click(page.getByRole('button', { name: 'Filtros de matérias' }));
        const label = 'Ocultar turmas indisponíveis';
        fixture.testing.fireEvent.click(page.getByRole('checkbox', { name: label }));
        expect(page.getByRole('checkbox', { name: label }).getAttribute('aria-checked')).toBe(
            'true'
        );
        fixture.testing.fireEvent.click(page.getByRole('button', { name: 'Limpar filtros' }));
        expect(page.getByRole('checkbox', { name: label }).getAttribute('aria-checked')).toBe(
            'false'
        );
    });

    test('combina obrigatórias e optativas da matriz do aluno', async () => {
        fixture.client.setQueryData(meQueryOptions.queryKey, electiveStudent);
        const page = fixture.renderPage('?category=classrooms');
        fixture.testing.fireEvent.click(page.getByRole('button', { name: 'Filtros de matérias' }));
        fixture.testing.fireEvent.click(await page.findByRole('button', { name: 'Obrigatórias' }));
        fixture.testing.fireEvent.click(page.getByRole('button', { name: 'Optativas' }));
        await fixture.testing.waitFor(() => {
            expect(fixture.requests.at(-1)?.searchParams.getAll('kind')).toEqual([
                'mandatory',
                'optional'
            ]);
        });
    });
});
