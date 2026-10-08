import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { components } from '#/queries/schema.gen';

import { FrequencyContent } from '#/components/classroom/FrequencyContent';

type Frequency = components['schemas']['ClassroomFrequencyView'];

const progress = { taught: 30, total: 60, percentage: 50 };

const registered: Frequency = {
    progress,
    frequency_status: 'registered',
    unregistered_entries: [],
    frequency: {
        attended: 28,
        registered: 30,
        registered_percentage: 93.3,
        total: 60,
        total_percentage: 46.7,
        entries: [
            { occurred_on: '2026-10-05', status: 'presente', absences: 0 },
            { occurred_on: '2026-10-07', status: 'falta', absences: 2 },
            { occurred_on: '2026-10-06', status: 'nao_registrada', absences: 0 }
        ],
        summary: {
            total_entries: 3,
            recorded_entries: 2,
            unrecorded_entries: 1,
            absence_entries: 1,
            total_absences: 2
        }
    }
};

const withPercentage = (registered_percentage: number): Frequency => ({
    ...registered,
    frequency: { ...registered.frequency!, registered_percentage }
});

const tone = (percentage: number) =>
    renderToStaticMarkup(<FrequencyContent data={withPercentage(percentage)} />).match(
        /<dd class="([^"]*)">[\d,]+%</
    )?.[1];

describe('FrequencyContent', () => {
    test('mostra o resumo de presenças, faltas e aulas sem registro', () => {
        const markup = renderToStaticMarkup(<FrequencyContent data={registered} />);
        expect(markup).not.toContain('Presença registrada');
        expect(markup).toMatch(/Presenças<\/dt><dd[^>]*>1</);
        expect(markup).toMatch(/Faltas<\/dt><dd[^>]*>2</);
        expect(markup).toMatch(/Frequência<\/dt><dd[^>]*>93,3%</);
    });

    test('colore a frequência: normal acima de 80%, amarelo até 80%, vermelho abaixo de 75%', () => {
        expect(tone(80.1)).not.toMatch(/text-(warning|destructive)/);
        expect(tone(80)).toContain('text-warning');
        expect(tone(75)).toContain('text-warning');
        expect(tone(74.9)).toContain('text-destructive');
    });

    test('lista as aulas da mais recente para a mais antiga, com o dia da semana', () => {
        const markup = renderToStaticMarkup(<FrequencyContent data={registered} />);
        const order = ['07/10/2026', '06/10/2026', '05/10/2026'].map((date) =>
            markup.indexOf(date)
        );
        expect(order).toEqual(order.toSorted((a, b) => a - b));
        expect(markup).toContain('qua');
        expect(markup).toContain('2 faltas');
        expect(markup).toContain('Não registrada');
    });

    test('avisa quando o professor ainda não lançou a frequência', () => {
        const markup = renderToStaticMarkup(
            <FrequencyContent
                data={{
                    progress,
                    frequency_status: 'not_registered',
                    frequency: null,
                    unregistered_entries: []
                }}
            />
        );
        expect(markup).toContain('ainda não foi lançada');
        expect(markup).not.toContain('Presença registrada');
        expect(markup).not.toContain('Faltas');
    });

    test('avisa quando só parte das aulas foi registrada', () => {
        const markup = renderToStaticMarkup(
            <FrequencyContent data={{ ...registered, frequency_status: 'partially_registered' }} />
        );
        expect(markup).toContain('ainda não foi registrada');
    });

    test('inclui marcações manuais nos indicadores e ignora aulas canceladas', () => {
        const markup = renderToStaticMarkup(
            <FrequencyContent
                data={registered}
                manualEntries={[
                    { occurred_on: '2026-10-06', position: 0, status: 'ausente', manual: true },
                    { occurred_on: '2026-10-04', position: 0, status: 'cancelada', manual: true }
                ]}
            />
        );
        expect(markup).not.toContain('Minhas marcações');
        expect(markup).toContain('Aula cancelada');
        expect(markup).toMatch(/Presenças<\/dt><dd[^>]*>1</);
        expect(markup).toMatch(/Faltas<\/dt><dd[^>]*>3</);
        expect(markup).toMatch(/Frequência<\/dt><dd[^>]*>90,3%</);
        expect(markup).toContain('Frequência estimada');
    });

    test('calcula os indicadores apenas pelas marcações quando não há chamada do SIGAA', () => {
        const markup = renderToStaticMarkup(
            <FrequencyContent
                data={{
                    progress,
                    frequency_status: 'not_registered',
                    frequency: null,
                    unregistered_entries: [
                        { occurred_on: '2026-10-05', status: 'nao_registrada', absences: 0 },
                        { occurred_on: '2026-10-06', status: 'nao_registrada', absences: 0 }
                    ]
                }}
                manualEntries={[
                    { occurred_on: '2026-10-05', position: 0, status: 'presente', manual: true },
                    { occurred_on: '2026-10-06', position: 0, status: 'ausente', manual: true }
                ]}
            />
        );
        expect(markup).toMatch(/Presenças<\/dt><dd[^>]*>1</);
        expect(markup).toMatch(/Faltas<\/dt><dd[^>]*>1</);
        expect(markup).toMatch(/Frequência<\/dt><dd[^>]*>50%</);
    });

    test('a presença do SIGAA prevalece sobre a marcação do aluno', () => {
        const markup = renderToStaticMarkup(
            <FrequencyContent
                data={registered}
                manualEntries={[
                    { occurred_on: '2026-10-07', position: 0, status: 'presente', manual: true }
                ]}
            />
        );
        expect(markup).toContain('2 faltas');
        expect(markup).not.toContain('Minhas marcações');
        expect(markup).toMatch(/Faltas<\/dt><dd[^>]*>2</);
        expect(markup).toMatch(/Frequência<\/dt><dd[^>]*>93,3%</);
    });

    test('alterna a situação pela bolinha da aula sem select', () => {
        const markup = renderToStaticMarkup(
            <FrequencyContent
                data={{
                    progress,
                    frequency_status: 'not_registered',
                    frequency: null,
                    unregistered_entries: []
                }}
                manualEntries={[
                    { occurred_on: '2026-10-06', position: 0, status: 'ausente', manual: true }
                ]}
                onSave={async () => {}}
                onRemove={async () => {}}
            />
        );
        expect(markup).not.toContain('Adicionar aula');
        expect(markup).not.toContain('Data da aula');
        expect(markup).not.toContain('<select');
        expect(markup).toContain('<button');
        expect(markup).toContain('relative flex size-4');
        expect(markup).toContain('after:-inset-2');
        expect(markup).not.toContain('size-8');
        expect(markup).toContain(
            'Situação de 06/10/2026, aula 1: Ausente. Alterar para aula cancelada.'
        );
        expect(markup).toContain('Ausente');
    });

    test('o ciclo da bolinha percorre presente, ausente, cancelada e não marcada', () => {
        const cases = [
            [undefined, 'presente'],
            ['presente', 'ausente'],
            ['ausente', 'aula cancelada'],
            ['cancelada', 'não marcada']
        ] as const;
        for (const [status, next] of cases) {
            const markup = renderToStaticMarkup(
                <FrequencyContent
                    data={registered}
                    manualEntries={
                        status
                            ? [{ occurred_on: '2026-10-06', position: 0, status, manual: true }]
                            : []
                    }
                    onSave={async () => {}}
                    onRemove={async () => {}}
                />
            );
            expect(markup).toContain(`Alterar para ${next}`);
            expect(markup).not.toContain('Situação de 05/10/2026');
            expect(markup).not.toContain('Situação de 07/10/2026');
        }
    });

    test('distingue aulas diferentes na mesma data', () => {
        const markup = renderToStaticMarkup(
            <FrequencyContent
                data={{
                    progress,
                    frequency_status: 'not_registered',
                    frequency: null,
                    unregistered_entries: []
                }}
                manualEntries={[
                    { occurred_on: '2026-10-06', position: 0, status: 'presente', manual: true },
                    { occurred_on: '2026-10-06', position: 1, status: 'ausente', manual: true }
                ]}
            />
        );
        expect(markup).toContain('Aula 1');
        expect(markup).toContain('Aula 2');
    });

    test('mostra aulas anteriores previstas pelo calendário sem chamada do SIGAA', () => {
        const markup = renderToStaticMarkup(
            <FrequencyContent
                data={{
                    progress,
                    frequency_status: 'not_registered',
                    frequency: null,
                    unregistered_entries: [
                        { occurred_on: '2026-10-05', status: 'nao_registrada', absences: 0 }
                    ]
                }}
                onSave={async () => {}}
                onRemove={async () => {}}
            />
        );
        expect(markup).toContain('05/10/2026');
        expect(markup).toContain('Situação de 05/10/2026, aula 1');
        expect(markup).not.toContain('Minhas marcações');
    });
});
