import { expect, test } from 'bun:test';

import type { DailyMenu } from '#/queries/restaurant';

import { DesktopContext } from '#/components/DesktopContext';
import { PublicInfoSection } from '#/components/home/PublicInfoSection';

import { renderWithRouter } from '../../helpers/router';

const menu: DailyMenu = {
    date: '2026-11-10',
    breakfast: [{ name: 'Complemento', key: 'complement', items: ['Pão'] }],
    lunch: [{ name: 'Prato', key: 'main_dish', items: ['Arroz com legumes'] }],
    dinner: [{ name: 'Prato', key: 'main_dish', items: ['Sopa'] }]
};

function render(time: string, data = [menu]) {
    return renderWithRouter(
        <DesktopContext value={true}>
            <PublicInfoSection
                campus="Darcy"
                menus={data}
                day="Hoje"
                date="2026-11-10"
                now={{ date: '2026-11-10', weekday: 2, time }}
            />
        </DesktopContext>
    );
}

test('prévia desktop mostra só a refeição atual', () => {
    const html = render('08:00');
    expect(html).toContain('Café da manhã');
    expect(html).toContain('Pão');
    expect(html).not.toContain('Almoço');
    expect(html).not.toContain('Sopa');
});

test('entre refeições mostra a próxima e não mantém oferta encerrada', () => {
    const html = render('16:00');
    expect(html).toContain('Jantar');
    expect(html).toContain('Sopa');
    expect(html).not.toContain('Café da manhã');
    expect(html).not.toContain('Almoço');
});

test('após o jantar mostra o café de amanhã', () => {
    const tomorrow = {
        ...menu,
        date: '2026-11-11',
        breakfast: [{ name: 'Complemento', key: 'complement' as const, items: ['Pão com ovos'] }]
    };
    const html = render('22:00', [menu, tomorrow]);
    expect(html).toContain('Café da manhã · amanhã');
    expect(html).toContain('Pão com ovos');
    expect(html).not.toContain('Sopa');
    expect(html).not.toContain('aria-roledescription');
});

test('após o jantar sem cardápio de amanhã avisa que o café não foi publicado', () => {
    expect(render('22:00')).toContain('Cardápio do café da manhã não publicado.');
});
