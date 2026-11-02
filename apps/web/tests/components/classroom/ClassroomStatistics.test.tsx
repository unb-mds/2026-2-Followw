import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test } from 'bun:test';

import type { ClassroomFrequency } from '#/queries/classrooms';
import type { components } from '#/queries/schema.gen';

import { ClassroomStatistics } from '#/components/classroom/ClassroomStatistics';
import {
    classroomFrequencyQueryOptions,
    classroomStatisticsQueryOptions
} from '#/queries/classrooms';

import { useDom } from '../../helpers/dom';

const dom = useDom();
afterEach(() => dom.testing.cleanup());

const frequency: ClassroomFrequency = {
    progress: { taught: 48, total: 72, percentage: 67 },
    frequency_status: 'registrada',
    lessons: [],
    totals: { presences: 42, absences: 4, percentage: 91.7, max_absences: 15, estimated: false }
};

function render(shares: components['schemas']['StatisticsShare'][]) {
    const client = new QueryClient({
        defaultOptions: { queries: { staleTime: Infinity, retry: false } }
    });
    client.setQueryData(classroomStatisticsQueryOptions('antiga').queryKey, shares);
    client.setQueryData(classroomFrequencyQueryOptions('antiga').queryKey, frequency);
    client.setQueryData(classroomStatisticsQueryOptions('outra').queryKey, [
        { situation: 'aprovado', percentage: 100 }
    ]);
    return dom.testing.render(
        <QueryClientProvider client={client}>
            <ClassroomStatistics id="antiga" />
        </QueryClientProvider>
    );
}

test('mostra os percentuais da própria turma sem filtros e oculta situações zeradas', () => {
    const page = render([
        { situation: 'aprovado', percentage: 72.5 },
        { situation: 'reprovado', percentage: 27.5 },
        { situation: 'trancado', percentage: 0 }
    ]);
    expect(page.getByText('72,5%')).toBeTruthy();
    expect(page.getByText('27,5%')).toBeTruthy();
    expect(page.queryByText('100%')).toBeNull();
    expect(page.queryByText('Trancado')).toBeNull();
    expect(page.queryByText('0%')).toBeNull();
    expect(page.queryByText('Média geral')).toBeNull();
    expect(page.queryAllByRole('button')).toHaveLength(0);
});

test.each([{ shares: [] }, { shares: [{ situation: 'aprovado' as const, percentage: 0 }] }])(
    'mostra indisponibilidade quando não há resultados positivos: %p',
    ({ shares }) => {
        const page = render([...shares]);
        expect(page.getByText('Resultados desta turma indisponíveis')).toBeTruthy();
        expect(page.queryByLabelText('Situação dos discentes desta turma')).toBeNull();
    }
);

test('exibe a frequência abaixo do gráfico, cada um com seu título', () => {
    const page = render([{ situation: 'aprovado', percentage: 100 }]);
    const headings = page.getAllByRole('heading').map((heading) => heading.textContent);
    expect(headings.slice(0, 2)).toEqual(['Resultados da turma', 'Sua frequência']);
    const chart = page.getByLabelText('Situação dos discentes desta turma');
    const presences = page.getByText('Presenças');
    expect(
        chart.compareDocumentPosition(presences) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(page.getByText('42')).toBeTruthy();
    expect(page.getByText('91,7%')).toBeTruthy();
    expect(page.getByText('48 / 72')).toBeTruthy();
});
