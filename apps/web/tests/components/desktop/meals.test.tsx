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

test('prévia desktop disponibiliza as refeições do dia e inicia pelo café', () => {
    const html = render('08:00');
    expect(html).toContain('Café da manhã');
    expect(html).toContain('Almoço');
    expect(html).not.toContain('Atual ·');
    expect(html).not.toContain('Próxima refeição ·');
    expect(html).toContain('Sopa');
});

test('não inventa próxima refeição nem mantém oferta encerrada', () => {
    const html = render('18:00');
    expect(html).toContain('Jantar');
    expect(html).not.toContain('Café da manhã');
    expect(html).not.toContain('Almoço');
    expect(render('20:00')).toContain('Cardápio das próximas refeições não publicado.');
    const breakfastOnly = render('08:00', [{ ...menu, lunch: null, dinner: null }]);
    expect(breakfastOnly).not.toContain('Almoço');
    expect(breakfastOnly).not.toContain('Jantar');
});

test('após o jantar mostra café e almoço de amanhã com destaque apenas na refeição mais próxima', () => {
    const tomorrow = {
        ...menu,
        date: '2026-11-11',
        breakfast: [{ name: 'Complemento', key: 'complement' as const, items: ['Pão com ovos'] }],
        lunch: [{ name: 'Prato', key: 'main_dish' as const, items: ['Frango assado'] }],
        dinner: [{ name: 'Prato', key: 'main_dish' as const, items: ['Omelete'] }]
    };
    const html = render('22:00', [menu, tomorrow]);
    expect(html).toContain('Café da manhã');
    expect(html).toContain('Almoço');
    expect(html).not.toContain('amanhã');
    expect(html).not.toContain('Próxima refeição ·');
    expect(html).toContain('Pão com ovos');
    expect(html).toContain('Frango assado');
    expect(html).not.toContain('Sopa');
    expect(html.match(/aria-roledescription="slide"/g)).toHaveLength(4);
    expect(html.match(/data-state="active"/g)).toHaveLength(1);
});

test('durante o jantar mantém somente a refeição atual até encerrar', () => {
    const html = render('18:00', [menu, { ...menu, date: '2026-11-11' }]);
    expect(html).toContain('Jantar');
    expect(html).not.toContain('Café da manhã');
    expect(html).not.toContain('Almoço');
});
