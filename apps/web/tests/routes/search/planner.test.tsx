import { allClassroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { searchQueryOptions } from '@followw/core/queries/search.ts';
import { expect, test } from 'bun:test';

import { meQueryOptions } from '#/queries/me';

import {
    describeSearchPage,
    electiveStudent,
    noProfessors,
    paged,
    turma
} from '../../helpers/search-page';

describeSearchPage('Montagem da grade pela busca', (fixture) => {
    test('permite avançar quando a grade oculta toda a primeira página de livres', async () => {
        fixture.client.setQueryData(meQueryOptions.queryKey, electiveStudent);
        fixture.scheduleResults.set('base', [
            { code: 'MAT0001', name: 'Base', classrooms: [turma('01', '2M12')] }
        ]);
        fixture.electiveOffer = [
            ...Array.from({ length: 25 }, (_, index) => ({
                code: `ADM${String(index).padStart(4, '0')}`,
                name: `Conflitante ${index}`,
                classrooms: [turma('01', '2M1')]
            })),
            { code: 'ADM0025', name: 'Livre sem conflito', classrooms: [turma('01', '4M1')] }
        ];
        const initial = fixture.renderPage('?q=base');
        fixture.testing.fireEvent.click(await initial.findByRole('button', { name: /MAT0001/ }));
        fixture.testing.fireEvent.click(
            await initial.findByRole('button', { name: 'Adicionar à grade: MAT0001, turma 01' })
        );
        initial.unmount();

        const page = fixture.renderPage('?freeModules=true&hideConflicts=true');
        const more = await page.findByRole('button', { name: 'Mostrar mais' });
        expect(page.queryByText(/Conflitante/)).toBeNull();
        fixture.testing.fireEvent.click(more);
        expect(await page.findByText('Livre sem conflito')).toBeDefined();
        const second = fixture.requests.find((url) => url.searchParams.get('page') === '2');
        expect(second?.pathname).toBe('/api/public/subjects');
        expect(second?.searchParams.getAll('kind')).toEqual(['free']);
        expect(page.queryByRole('button', { name: 'Mostrar mais' })).toBeNull();
    });

    test('adiciona pelo resultado e mantém a grade ao mudar a busca', async () => {
        fixture.client.setQueryData(searchQueryOptions('calculo').queryKey, {
            subjects: paged([
                {
                    code: 'MAT0023',
                    name: 'Cálculo 1',
                    classrooms: [
                        { number: '01', semester: '2026.2', professors: [], schedule: '24M12' }
                    ]
                }
            ]),
            courses: paged([]),
            professors: noProfessors
        });
        const page = fixture.renderPage('?q=calculo');
        fixture.testing.fireEvent.click(page.getByRole('button', { name: /MAT0023/ }));
        fixture.testing.fireEvent.click(
            await page.findByRole('button', { name: 'Adicionar à grade: MAT0023, turma 01' })
        );
        expect(page.queryByRole('dialog')).toBeNull();
        fixture.testing.fireEvent.change(fixture.searchbox(page), { target: { value: 'fisica' } });
        await fixture.testing.waitFor(() =>
            expect(fixture.requests.some((url) => url.searchParams.get('q') === 'fisica')).toBe(
                true
            )
        );
        expect(page.getByRole('toolbar', { name: 'Turmas selecionadas' }).textContent).toContain(
            '1 turma'
        );
        fixture.testing.fireEvent.click(page.getByRole('button', { name: 'Ver grade' }));
        await page.findByRole('dialog', { name: 'Minha grade semanal' });
        expect(page.getByRole('region', { name: 'Grade semanal 2026.2' }).textContent).toContain(
            'MAT0023'
        );
    });

    test('oculta conflitos ao montar a grade e mantém a regra ao pesquisar outra matéria', async () => {
        const base = { code: 'MAT0001', name: 'Base', classrooms: [turma('01', '24M12')] };
        const parcial = {
            code: 'MAT0002',
            name: 'Parcial',
            classrooms: [turma('01', '4M2'), turma('02', '4M3')]
        };
        const bloqueada = { code: 'MAT0003', name: 'Bloqueada', classrooms: [turma('01', '2M1')] };
        fixture.scheduleResults.set('lista', [base, parcial, bloqueada]);
        fixture.scheduleResults.set('bloqueada', [bloqueada]);
        const page = fixture.renderPage('?q=lista&category=classrooms');
        fixture.testing.fireEvent.click(
            await page.findByRole('button', { name: 'Filtros de matérias' })
        );
        fixture.testing.fireEvent.click(
            await page.findByRole('checkbox', { name: 'Ocultar conflitos de horário' })
        );
        fixture.testing.fireEvent.click(
            await page.findByRole('button', { name: 'Filtros de matérias ativos' })
        );
        await page.findByText('3 resultados');
        fixture.testing.fireEvent.click(page.getByRole('button', { name: /MAT0001/ }));
        fixture.testing.fireEvent.click(
            await page.findByRole('button', { name: 'Adicionar à grade: MAT0001, turma 01' })
        );
        await page.findByText('2 resultados');
        expect(page.queryByText('Bloqueada')).toBeNull();
        fixture.testing.fireEvent.click(page.getByRole('button', { name: /Parcial/ }));
        expect(
            page.queryByRole('button', { name: 'Adicionar à grade: MAT0002, turma 01' })
        ).toBeNull();
        expect(
            page.getByRole('button', { name: 'Adicionar à grade: MAT0002, turma 02' })
        ).toBeDefined();
        fixture.testing.fireEvent.change(fixture.searchbox(page), {
            target: { value: 'bloqueada' }
        });
        await page.findByText('Nenhuma matéria encontrada. Tente mudar a busca.');
        expect(page.queryByText('Bloqueada')).toBeNull();
        fixture.testing.fireEvent.click(
            page.getByRole('button', { name: 'Filtros de matérias ativos' })
        );
        const toggle = await page.findByRole('checkbox', { name: 'Ocultar conflitos de horário' });
        expect(toggle.getAttribute('aria-checked')).toBe('true');
        fixture.testing.fireEvent.click(toggle);
        await page.findByText('Bloqueada');
    });

    test.each([
        '?q=matematica&category=classrooms',
        '?q=matematica&start=10%3A00',
        '?electives=true',
        '?q=matematica&start=10%3A00&electives=true'
    ])('exibe matérias aprovadas, em andamento e reprovadas em %s', async (params) => {
        fixture.client.setQueryData(meQueryOptions.queryKey, electiveStudent);
        const approved = { code: 'MAT1000', name: 'Matemática Aprovada' };
        const failed = { code: 'MAT2000', name: 'Matemática a Refazer' };
        const current = { code: 'MAT3000', name: 'Matemática em Andamento' };
        fixture.client.setQueryData(allClassroomsQueryOptions.queryKey, [
            {
                id: 'a',
                number: '01',
                semester: '2026.1',
                current: false,
                subject: approved,
                grade: 'MS',
                professors: []
            },
            {
                id: 'b',
                number: '01',
                semester: '2026.1',
                current: false,
                subject: failed,
                grade: 'MI',
                professors: []
            },
            {
                id: 'c',
                number: '01',
                semester: '2026.2',
                current: true,
                subject: current,
                status: 'cursando',
                professors: []
            }
        ]);
        const subjects = [approved, failed, current];
        const classrooms = [{ number: '01', semester: '2026.2', schedule: '2M34', professors: [] }];
        const results = subjects.map(({ code, name }) => ({ code, name, classrooms }));
        fixture.electiveOffer = results;
        fixture.scheduleResults.set('matematica', results);
        fixture.client.setQueryData(searchQueryOptions('matematica', ['subjects']).queryKey, {
            subjects: paged(results),
            professors: null,
            courses: null
        });

        const page = fixture.renderPage(params);
        expect(await page.findByText('3 resultados')).toBeDefined();
        expect(page.getByRole('button', { name: /MAT1000/ })).toBeDefined();
        expect(page.getByRole('button', { name: /MAT2000/ })).toBeDefined();
        expect(page.getByRole('button', { name: /MAT3000/ })).toBeDefined();
    });

    test('adiciona um módulo livre ofertado à grade pelo filtro de módulos livres', async () => {
        fixture.client.setQueryData(meQueryOptions.queryKey, electiveStudent);
        fixture.electiveOffer = [
            {
                code: 'FIS0123',
                name: 'Física Aplicada',
                kind: 'free',
                classrooms: [
                    { number: '01', semester: '2026.2', schedule: '24M12', professors: [] }
                ]
            }
        ];
        const page = fixture.renderPage('?category=classrooms');
        expect(page.queryByRole('button', { name: 'Optativas' })).toBeNull();
        fixture.testing.fireEvent.click(page.getByRole('button', { name: 'Filtros de matérias' }));
        const toggle = await page.findByRole('button', { name: 'Livres' });
        expect(toggle.getAttribute('aria-pressed')).toBe('false');
        expect(page.queryByRole('button', { name: 'Dom' })).toBeNull();
        const optional = page.getByRole('button', { name: 'Optativas' });
        fixture.testing.fireEvent.click(optional);
        await fixture.testing.waitFor(() =>
            expect(fixture.requests.at(-1)?.searchParams.getAll('kind')).toEqual(['optional'])
        );
        expect(toggle.getAttribute('aria-pressed')).toBe('false');
        fixture.testing.fireEvent.click(toggle);
        await fixture.testing.waitFor(() => {
            expect(fixture.requests.at(-1)?.searchParams.getAll('kind')).toEqual([
                'optional',
                'free'
            ]);
        });
        fixture.testing.fireEvent.click(optional);
        await fixture.testing.waitFor(() =>
            expect(optional.getAttribute('aria-pressed')).toBe('false')
        );
        expect(toggle.getAttribute('aria-pressed')).toBe('true');
        fixture.testing.fireEvent.click(
            page.getByRole('button', { name: 'Filtros de matérias ativos' })
        );
        const physics = await page.findByRole('button', { name: /Física Aplicada/ });
        expect(physics.textContent).toContain('Módulo livre');
        expect(
            fixture.requests.some((url) => url.searchParams.getAll('kind').join() === 'free')
        ).toBe(true);
        fixture.testing.fireEvent.click(physics);
        expect(await page.findByRole('button', { name: 'Detalhes da turma 01' })).toBeDefined();
        expect(physics.textContent).toContain('1 turma');
        fixture.testing.fireEvent.click(
            page.getByRole('button', { name: 'Adicionar à grade: FIS0123, turma 01' })
        );
        expect(page.getByRole('toolbar', { name: 'Turmas selecionadas' }).textContent).toContain(
            '1 turma'
        );
        expect(page.getByRole('button', { name: 'Filtros de matérias ativos' })).toBeDefined();
    });
});
