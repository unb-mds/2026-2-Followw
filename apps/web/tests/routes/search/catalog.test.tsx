import { expect, test } from 'bun:test';

import { describeSearchPage, makeCourse, makeProfessor } from '../../helpers/search-page';

describeSearchPage('Cursos e docentes na busca', (fixture) => {
    test('exibe cursos antes das turmas com nome, graduação, turno e unidade', async () => {
        fixture.courses = [
            {
                id: 1,
                sigaa_id: 100,
                degree: 'Licenciatura',
                name: 'CÁLCULO APLICADO',
                shift: 'DIURNO',
                unit: { id: 1, code: 'MAT', name: 'DEPARTAMENTO DE MATEMÁTICA' }
            }
        ];
        const page = fixture.renderPage('?q=calculo');
        await page.findByText('Cálculo 1');
        const course = page.getByRole('heading', { name: 'Cálculo Aplicado' });
        const subjects = page.getByRole('heading', { name: /^Turmas$/ });
        expect(
            course.compareDocumentPosition(subjects) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
        expect(page.getByText('Licenciatura · Diurno')).toBeDefined();
        expect(page.getByText('Departamento de Matemática')).toBeDefined();
        expect(fixture.searchbox(page).placeholder).toBe(
            'Busque por matéria, horário, curso ou professor...'
        );
    });

    test.each([1, 25])('aba Cursos lista %i cursos sem oferecer mais páginas', async (total) => {
        fixture.courses = Array.from({ length: total }, (_, index) => makeCourse(index + 1));
        const page = fixture.renderPage('?q=engenharia&category=courses');
        const section = fixture.testing.within(await page.findByRole('region', { name: 'Cursos' }));
        expect(section.getByText(`${total} ${total === 1 ? 'curso' : 'cursos'}`)).toBeDefined();
        expect(section.getAllByRole('link')).toHaveLength(total);
        expect(section.queryByRole('button')).toBeNull();
    });

    test('aba Cursos pede à API as páginas seguintes da mesma busca', async () => {
        fixture.courses = Array.from({ length: 60 }, (_, index) => makeCourse(index + 1));
        const page = fixture.renderPage('?q=engenharia&category=courses');
        const section = fixture.testing.within(await page.findByRole('region', { name: 'Cursos' }));
        expect(section.getByText('60 cursos')).toBeDefined();
        expect(section.getAllByRole('link')).toHaveLength(25);
        fixture.testing.fireEvent.click(
            section.getByRole('button', { name: 'Ver mais cursos (35 restantes)' })
        );
        await fixture.testing.waitFor(() => expect(section.getAllByRole('link')).toHaveLength(50));
        fixture.testing.fireEvent.click(
            section.getByRole('button', { name: 'Ver mais cursos (10 restantes)' })
        );
        await fixture.testing.waitFor(() => expect(section.getAllByRole('link')).toHaveLength(60));
        expect(section.queryByRole('button')).toBeNull();
        expect(
            fixture.requests
                .filter((url) => url.pathname.endsWith('/public/courses'))
                .map((url) => url.search)
        ).toEqual(['?q=engenharia&page=2', '?q=engenharia&page=3']);
    });

    test('uma nova busca volta a mostrar só a primeira página de cursos', async () => {
        fixture.courses = Array.from({ length: 30 }, (_, index) => makeCourse(index + 1));
        const page = fixture.renderPage('?q=eng&category=courses');
        fixture.testing.fireEvent.click(
            await page.findByRole('button', { name: 'Ver mais cursos (5 restantes)' })
        );
        const links = () =>
            fixture.testing
                .within(page.getByRole('region', { name: 'Cursos' }))
                .getAllByRole('link');
        await fixture.testing.waitFor(() => expect(links()).toHaveLength(30));
        fixture.testing.fireEvent.change(fixture.searchbox(page), {
            target: { value: 'engenharia' }
        });
        await page.findByRole('button', { name: 'Ver mais cursos (5 restantes)' });
        expect(links()).toHaveLength(25);
    });

    test('falha ao carregar mais cursos avisa e a nova tentativa mostra o carregamento', async () => {
        fixture.courses = Array.from({ length: 30 }, (_, index) => makeCourse(index + 1));
        const page = fixture.renderPage('?q=engenharia&category=courses');
        const section = fixture.testing.within(await page.findByRole('region', { name: 'Cursos' }));
        const more = { name: 'Ver mais cursos (5 restantes)' };
        fixture.failPage = 2;
        fixture.testing.fireEvent.click(section.getByRole('button', more));
        await section.findByText('Não foi possível carregar mais cursos.');
        expect(section.getAllByRole('link')).toHaveLength(25);
        fixture.failPage = null;
        const { promise, resolve: release } = Promise.withResolvers<void>();
        fixture.gate = promise;
        fixture.testing.fireEvent.click(section.getByRole('button', more));
        const loading = await section.findByRole('button', { name: 'Carregando...' });
        expect(loading.hasAttribute('disabled')).toBe(true);
        expect(section.queryByText('Não foi possível carregar mais cursos.')).toBeNull();
        release();
        await fixture.testing.waitFor(() => expect(section.getAllByRole('link')).toHaveLength(30));
        expect(section.queryByRole('button')).toBeNull();
    });

    test('aba Todos mostra prévia de cinco cursos e docentes que leva à aba própria', async () => {
        fixture.courses = Array.from({ length: 12 }, (_, index) =>
            makeCourse(index + 1, `CARLOS ${index + 1}`)
        );
        fixture.professors = Array.from({ length: 7 }, (_, index) =>
            makeProfessor(index + 1, `CARLOS ${index}`)
        );
        const page = fixture.renderPage('?q=carlos');
        const region = (name: string) => fixture.testing.within(page.getByRole('region', { name }));
        await page.findByRole('region', { name: 'Cursos' });
        expect(region('Cursos').getAllByRole('link')).toHaveLength(5);
        expect(region('Docentes').getAllByRole('link')).toHaveLength(5);
        expect(
            region('Docentes').getByRole('button', { name: 'Ver todos os docentes (7)' })
        ).toBeDefined();
        expect(page.queryByRole('button', { name: /Ver mais/ })).toBeNull();
        fixture.testing.fireEvent.click(
            region('Cursos').getByRole('button', { name: 'Ver todos os cursos (12)' })
        );
        await fixture.testing.waitFor(() =>
            expect(region('Cursos').getAllByRole('link')).toHaveLength(12)
        );
        expect(
            fixture.requests.filter((url) => url.pathname.endsWith('/public/search'))
        ).toHaveLength(1);
        expect(fixture.updates.at(-1)?.searchParams.get('category')).toBe('courses');
        expect(fixture.updates.at(-1)?.searchParams.get('q')).toBe('carlos');
    });

    test('aba Cursos sem texto lista o catálogo e carrega a próxima página', async () => {
        fixture.courses = Array.from({ length: 30 }, (_, index) => makeCourse(index + 1));
        const page = fixture.renderPage('?category=courses');
        const section = fixture.testing.within(await page.findByRole('region', { name: 'Cursos' }));
        expect(section.getByText('30 cursos')).toBeDefined();
        expect(section.getAllByRole('link')).toHaveLength(25);
        expect(page.queryByText(/Para buscar pelo início da aula/)).toBeNull();
        fixture.testing.fireEvent.click(
            section.getByRole('button', { name: 'Ver mais cursos (5 restantes)' })
        );
        await fixture.testing.waitFor(() => expect(section.getAllByRole('link')).toHaveLength(30));
        expect(fixture.requests.map((url) => `${url.pathname}${url.search}`)).toEqual([
            '/api/public/courses?page=1',
            '/api/public/courses?page=2'
        ]);
    });

    test('aba Docentes sem texto lista todos os docentes', async () => {
        fixture.professors = Array.from({ length: 3 }, (_, index) =>
            makeProfessor(index + 1, `DOCENTE ${index}`)
        );
        const page = fixture.renderPage('?category=professors');
        const section = fixture.testing.within(
            await page.findByRole('region', { name: 'Docentes' })
        );
        expect(section.getByText('3 docentes encontrados')).toBeDefined();
        expect(section.getAllByRole('link')).toHaveLength(3);
        expect(section.queryByRole('button')).toBeNull();
        expect(fixture.requests.map((url) => `${url.pathname}${url.search}`)).toEqual([
            '/api/public/professors?page=1'
        ]);
    });
});
