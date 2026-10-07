import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { components } from '#/queries/schema.gen';

import { FrequencyContent } from '#/components/classroom/FrequencyContent';

type Frequency = components['schemas']['ClassroomFrequency'];

const progress = { taught: 30, total: 60, percentage: 50 };

const registered: Frequency = {
    progress,
    frequency_status: 'registered',
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
                data={{ progress, frequency_status: 'not_registered', frequency: null }}
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
});
