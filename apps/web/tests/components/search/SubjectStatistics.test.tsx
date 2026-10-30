import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test, spyOn } from 'bun:test';

import type { components } from '#/queries/schema.gen';
import type { SubjectClassroom } from '#/queries/subjects';

import { SubjectStatistics } from '#/components/search/SubjectStatistics';
import { subjectStatisticsQueryOptions } from '#/queries/subject-statistics';

import { useDom } from '../../helpers/dom';

const dom = useDom();
const classroom: SubjectClassroom = { number: '01', semester: '2026.2', professors: ['Ana'] };
const options = subjectStatisticsQueryOptions('FGA0003', classroom);
const data: components['schemas']['SubjectStatistics'] = {
    overall: {
        semester: null,
        classrooms: 3,
        shares: [
            { situation: 'aprovado', percentage: 70 },
            { situation: 'reprovado_por_faltas', percentage: 30 },
            { situation: 'trancado', percentage: 0 }
        ]
    },
    semesters: [
        {
            semester: '2026.1',
            classrooms: 2,
            shares: [
                { situation: 'aprovado', percentage: 90 },
                { situation: 'reprovado_por_faltas', percentage: 10 }
            ]
        },
        {
            semester: '2025.2',
            classrooms: 1,
            shares: [
                { situation: 'aprovado', percentage: 25 },
                { situation: 'reprovado_por_faltas', percentage: 70 },
                { situation: 'trancado', percentage: 5 }
            ]
        }
    ]
};

afterEach(async () => {
    await dom.testing.act(async () => {
        dom.testing.cleanup();
        await new Promise((resolve) => setTimeout(resolve, 20));
    });
});

function render(statistics: components['schemas']['SubjectStatistics']) {
    const client = new QueryClient({
        defaultOptions: { queries: { staleTime: Infinity, retry: false } }
    });
    client.setQueryData(options.queryKey, statistics);
    return dom.testing.render(
        <QueryClientProvider client={client}>
            <SubjectStatistics code="FGA0003" classroom={classroom} />
        </QueryClientProvider>
    );
}

test('consulta usa o codigo e a turma de referencia', () => {
    expect(options.queryKey).toEqual([
        'get',
        '/public/subjects/{code}/statistics',
        {
            params: { path: { code: 'FGA0003' }, query: { semester: '2026.2', number: '01' } }
        }
    ]);
});

test('seleciona a media geral inicialmente e oculta situacoes zeradas em cada periodo', async () => {
    const dimensions = spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 320,
        bottom: 208,
        width: 320,
        height: 208,
        toJSON: () => ({})
    });
    try {
        const page = render(data);
        const buttons = page.getAllByRole('button');
        expect(buttons.map((button) => button.textContent)).toEqual([
            'Média geral',
            '2026.1',
            '2025.2'
        ]);
        expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
            'true',
            'false',
            'false'
        ]);
        await dom.testing.waitFor(() => expect(page.getByText('70%')).toBeTruthy());
        expect(page.getByText('Reprovado por faltas')).toBeTruthy();
        expect(page.queryByText('Trancado')).toBeNull();
        expect(page.queryByText('0%')).toBeNull();
        expect(page.queryByText(/Média simples de/)).toBeNull();
        expect(page.queryByText(/A cobertura pode ser parcial/)).toBeNull();
        expect(page.container.querySelector('svg')).not.toBeNull();

        dom.testing.fireEvent.click(page.getByRole('button', { name: '2026.1' }));
        await dom.testing.waitFor(() => expect(page.getByText('90%')).toBeTruthy());
        expect(page.getByText('10%')).toBeTruthy();
        expect(page.getByRole('button', { name: '2026.1' }).getAttribute('aria-pressed')).toBe(
            'true'
        );

        dom.testing.fireEvent.click(page.getByRole('button', { name: '2025.2' }));
        expect(page.getByText('Trancado')).toBeTruthy();
        expect(page.getByText('5%')).toBeTruthy();

        dom.testing.fireEvent.click(page.getByRole('button', { name: 'Média geral' }));
        expect(page.queryByText('Trancado')).toBeNull();
        expect(page.getByRole('button', { name: 'Média geral' }).getAttribute('aria-pressed')).toBe(
            'true'
        );
    } finally {
        dimensions.mockRestore();
    }
});

test('sem dados mostra a mensagem em vez de botoes e grafico', () => {
    const page = render({ overall: { semester: null, classrooms: 0, shares: [] }, semesters: [] });
    expect(
        page.getByText(
            'Não há estatísticas de semestres anteriores para esta matéria com os mesmos docentes.'
        )
    ).toBeTruthy();
    expect(page.queryAllByRole('button')).toHaveLength(0);
    expect(page.container.querySelector('svg')).toBeNull();
});
