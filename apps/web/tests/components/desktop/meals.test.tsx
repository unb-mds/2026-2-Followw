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

test('prévia desktop mostra somente a refeição atual e a próxima publicada', () => {
    const html = render('08:00');
    expect(html).toContain('Café da manhã');
    expect(html).toContain('Almoço');
    expect(html).not.toContain('Atual ·');
    expect(html).not.toContain('Próxima refeição ·');
    expect(html).not.toContain('Sopa');
});

test('não inventa próxima refeição nem mantém oferta encerrada', () => {
    const html = render('18:00');
    expect(html).toContain('Jantar');
    expect(html).not.toContain('Próxima refeição');
    expect(render('20:00')).toContain('Cardápio das próximas refeições não publicado.');
    expect(render('08:00', [{ ...menu, lunch: null, dinner: null }])).not.toContain(
        'Próxima refeição'
    );
});

test('após o jantar mostra café e almoço de amanhã com destaque apenas na refeição mais próxima', () => {
    const tomorrow = {
        ...menu,
        date: '2026-11-11',
        breakfast: [{ name: 'Complemento', key: 'complement' as const, items: ['Pão com ovos'] }],
        lunch: [{ name: 'Prato', key: 'main_dish' as const, items: ['Frango assado'] }]
    };
    const html = render('22:00', [menu, tomorrow]);
    expect(html).toContain('Café da manhã');
    expect(html).toContain('Almoço');
    expect(html).not.toContain('amanhã');
    expect(html).not.toContain('Próxima refeição ·');
    expect(html).toContain('Pão com ovos');
    expect(html).toContain('Frango assado');
    expect(html).not.toContain('Sopa');
    expect(html.match(/<dd\b/g)).toHaveLength(2);
    expect(html.match(/desktop:border-primary\/30/g)).toHaveLength(1);
});

test('durante o jantar mostra a refeição atual e o café da manhã seguinte', () => {
    const html = render('18:00', [menu, { ...menu, date: '2026-11-11' }]);
    expect(html).toContain('Jantar');
    expect(html).toContain('Café da manhã');
    expect(html).not.toContain('Almoço');
});
