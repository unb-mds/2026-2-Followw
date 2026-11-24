import { afterEach, expect, test } from 'bun:test';

import { WeeklySchedule } from '#/components/schedule/WeeklySchedule';

import { useDom } from '../../helpers/dom';

const dom = useDom();
afterEach(() => dom.testing.cleanup());

test('contém a rolagem horizontal e deixa a vertical seguir para o painel', () => {
    const view = dom.testing.render(
        <WeeklySchedule
            label="Grade semanal"
            entries={[
                {
                    key: 'FGA0313-2026.2-01',
                    code: 'FGA0313',
                    name: 'Requisitos de Software',
                    number: '01',
                    schedule: '35M12'
                }
            ]}
        />
    );
    const scroll = view.getByRole('region', { name: 'Grade semanal' }).firstElementChild;
    expect(scroll?.classList.contains('overscroll-x-contain')).toBe(true);
    expect(scroll?.classList.contains('overscroll-contain')).toBe(false);
    expect(view.queryByText(/Intervalo de/)).toBeNull();
});

test('mostra a duração aproximada de cada faixa omitida na grade', () => {
    const view = dom.testing.render(
        <WeeklySchedule
            label="Grade semanal"
            entries={[
                {
                    key: 'FGA0313-2026.2-01',
                    code: 'FGA0313',
                    name: 'Requisitos de Software',
                    number: '01',
                    schedule: '2M12 3T23 2N34'
                }
            ]}
        />
    );
    expect(view.getAllByText('~ Intervalo de 4h')).toHaveLength(2);
    expect(view.getByRole('figure', { name: /Ter, 14:00–15:50/ })).toBeTruthy();
    expect(view.queryByText('12:00')).toBeNull();
});
