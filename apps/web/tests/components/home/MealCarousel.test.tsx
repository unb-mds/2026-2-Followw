import {
    createMemoryHistory,
    createRootRoute,
    createRouter,
    RouterContextProvider
} from '@tanstack/react-router';
import { expect, test } from 'bun:test';

import type { DailyMenu } from '#/queries/restaurant';

import { DesktopContext } from '#/components/DesktopContext';
import { PublicInfoSection } from '#/components/home/PublicInfoSection';

import { useDom } from '../../helpers/dom';

const dom = useDom();
const today = '2026-11-10';
const menu: DailyMenu = {
    date: today,
    breakfast: [{ name: 'Complemento', key: 'complement', items: ['Pão com ovos'] }],
    lunch: [{ name: 'Prato', key: 'main_dish', items: ['Frango assado'] }],
    dinner: [{ name: 'Prato', key: 'main_dish', items: ['Sopa de legumes'] }]
};

function setup(time = '08:00', desktop = true) {
    const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory() });
    const element = (date = today, clock = time, campus: 'Darcy' | 'Gama' = 'Gama') => (
        <RouterContextProvider router={router}>
            <DesktopContext value={desktop}>
                <PublicInfoSection
                    campus={campus}
                    day="Hoje"
                    date={date}
                    now={{ date: today, weekday: 2, time: clock }}
                    menus={[menu, { ...menu, date: '2026-11-11' }]}
                />
            </DesktopContext>
        </RouterContextProvider>
    );
    const view = dom.testing.render(element());
    const carousel = view.getByRole('region', { name: 'Próximas refeições do RU' });
    let timestamp = 1000;
    function wheel(
        deltaY: number,
        options: { deltaX?: number; ctrlKey?: boolean; deltaMode?: number; pause?: number } = {}
    ) {
        timestamp += options.pause ?? 10;
        const event = new window.WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            deltaY,
            ...options
        });
        Object.defineProperty(event, 'timeStamp', { value: timestamp });
        Object.defineProperty(event, 'ctrlKey', { value: options.ctrlKey ?? false });
        dom.testing.fireEvent(carousel, event);
        return event;
    }
    return { view, carousel, wheel, element };
}

test('scroll avança uma refeição por gesto e a inércia não pula o jantar', () => {
    const { view, wheel } = setup();
    expect(view.getByRole('status').textContent).toContain('1 de 3: Café da manhã');
    expect(wheel(60).defaultPrevented).toBe(true);
    expect(view.getByRole('status').textContent).toContain('2 de 3: Almoço');
    wheel(120);
    wheel(80);
    expect(view.getByRole('status').textContent).toContain('2 de 3: Almoço');
    wheel(60, { pause: 200 });
    expect(view.getByRole('status').textContent).toContain('3 de 3: Jantar');
    wheel(-60);
    expect(view.getByRole('status').textContent).toContain('2 de 3: Almoço');
});

test('trackpad acumula pequenos movimentos sem renderizar uma troca para cada evento', () => {
    const { view, wheel } = setup();
    wheel(10);
    wheel(15);
    expect(view.getByRole('status').textContent).toContain('1 de 3');
    wheel(16);
    expect(view.getByRole('status').textContent).toContain('2 de 3');
});

test('libera o scroll antes do primeiro card, bloqueia após o cardápio e preserva zoom', () => {
    const { wheel, view } = setup();
    expect(wheel(-100).defaultPrevented).toBe(false);
    expect(wheel(100, { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(wheel(20, { deltaX: 80 }).defaultPrevented).toBe(false);
    dom.testing.fireEvent.click(view.getByRole('button', { name: 'Próxima refeição' }));
    dom.testing.fireEvent.click(view.getByRole('button', { name: 'Próxima refeição' }));
    dom.testing.fireEvent.click(view.getByRole('button', { name: 'Próxima refeição' }));
    expect(wheel(100, { pause: 200 }).defaultPrevented).toBe(true);
});

test('teclado e botões navegam, escondem cards anteriores e abrem a data e refeição corretas', () => {
    const { view, carousel } = setup();
    expect(view.getAllByRole('article')).toHaveLength(2);
    expect(view.queryByText('Role para ver as refeições')).toBeNull();
    expect(view.queryByText('1 / 3')).toBeNull();
    dom.testing.fireEvent.keyDown(carousel, { key: 'ArrowDown' });
    expect(view.queryByRole('article', { name: 'Café da manhã' })).toBeNull();
    expect(view.getByRole('link', { name: 'Ver cardápio de almoço' }).getAttribute('href')).toBe(
        '/ru?date=2026-11-10&meal=lunch'
    );
    dom.testing.fireEvent.click(view.getByRole('button', { name: 'Mostrar jantar' }));
    expect(view.getAllByRole('article')).toHaveLength(2);
    expect(view.getByRole('link', { name: 'Ver cardápio completo' })).toBeDefined();
    dom.testing.fireEvent.click(view.getByRole('button', { name: 'Próxima refeição' }));
    expect(view.getAllByRole('article')).toHaveLength(1);
    expect(view.getByRole('button', { name: 'Próxima refeição' }).hasAttribute('disabled')).toBe(
        true
    );
    dom.testing.fireEvent.click(view.getByRole('button', { name: 'Refeição anterior' }));
    expect(view.getByRole('status').textContent).toContain('3 de 3: Jantar');
    dom.testing.fireEvent.keyDown(carousel, { key: 'Home' });
    expect(view.getByRole('status').textContent).toContain('1 de 3: Café da manhã');
    dom.testing.fireEvent.keyDown(carousel, { key: 'End' });
    expect(view.getByRole('status').textContent).toBe('Ver cardápio completo');
});

test('durante o jantar navega somente para o cardápio completo sem mostrar amanhã', () => {
    const { view, wheel } = setup('18:00');
    expect(view.getAllByRole('article')).toHaveLength(2);
    expect(view.queryByRole('article', { name: 'Café da manhã' })).toBeNull();
    expect(view.getByRole('status').textContent).toContain('1 de 1: Jantar');
    expect(wheel(100).defaultPrevented).toBe(true);
    expect(view.getByRole('status').textContent).toBe('Ver cardápio completo');
    expect(wheel(100, { pause: 200 }).defaultPrevented).toBe(true);
});

test('trocar o dia, o campus ou encerrar uma refeição volta o foco à primeira oferta válida', () => {
    const { view, element, carousel } = setup();
    dom.testing.fireEvent.keyDown(carousel, { key: 'End' });
    view.rerender(element(today, '08:00', 'Darcy'));
    expect(view.getByRole('status').textContent).toContain('1 de 3: Café da manhã');
    dom.testing.fireEvent.click(view.getByRole('button', { name: 'Próxima refeição' }));
    view.rerender(element(today, '09:30', 'Darcy'));
    expect(view.getByRole('status').textContent).toContain('1 de 2: Almoço');
    view.rerender(element(today, '19:30'));
    expect(
        view.getByRole('link', { name: 'Ver cardápio de café da manhã' }).getAttribute('href')
    ).toContain('date=2026-11-11');
    view.rerender(element('2026-11-11'));
    expect(view.getByRole('status').textContent).toContain('1 de 3: Café da manhã');
});

test('ver cardápio aparece somente no último slide e mantém o dia exibido', () => {
    const { view, carousel } = setup();
    expect(view.queryByRole('link', { name: 'Ver Cardápio' })).toBeNull();
    expect(view.queryByRole('link', { name: 'Ver cardápio completo' })).toBeNull();
    dom.testing.fireEvent.keyDown(carousel, { key: 'End' });
    const link = view.getByRole('link', { name: 'Ver cardápio completo' });
    expect(link.textContent).toBe('Ver Cardápio');
    expect(link.getAttribute('href')).toBe('/ru?date=2026-11-10');
    expect(view.getByRole('status').textContent).toBe('Ver cardápio completo');
});

test('cardápio completo bloqueia a continuação do scroll e permite voltar às refeições', () => {
    const { view, carousel, wheel } = setup();
    dom.testing.fireEvent.keyDown(carousel, { key: 'End' });
    expect(wheel(100, { pause: 200 }).defaultPrevented).toBe(true);
    expect(wheel(120, { pause: 200 }).defaultPrevented).toBe(true);
    expect(view.getByRole('status').textContent).toBe('Ver cardápio completo');
    expect(wheel(-100).defaultPrevented).toBe(true);
    expect(view.getByRole('status').textContent).toContain('3 de 3: Jantar');
});

test.each([false, true])(
    'carrossel mantém refeições e cardápio completo com desktop=%s',
    (desktop) => {
        const { view, carousel } = setup('08:00', desktop);
        expect(view.getByRole('status').textContent).toContain('1 de 3: Café da manhã');
        expect(view.queryByRole('link', { name: 'Ver Cardápio' })).toBeNull();
        dom.testing.fireEvent.keyDown(carousel, { key: 'End' });
        expect(view.getByRole('link', { name: 'Ver cardápio completo' })).toBeDefined();
    }
);

test('gesto vertical no celular avança uma refeição, volta e para no cardápio completo', () => {
    const { view, carousel } = setup('08:00', false);
    function touch(type: string, x: number, y: number) {
        const event = new window.Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'touches', {
            value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }]
        });
        dom.testing.fireEvent(carousel, event);
        return event;
    }
    touch('touchstart', 100, 200);
    expect(touch('touchmove', 100, 130).defaultPrevented).toBe(true);
    expect(view.getByRole('status').textContent).toContain('2 de 3: Almoço');
    touch('touchmove', 100, 80);
    expect(view.getByRole('status').textContent).toContain('2 de 3: Almoço');
    touch('touchend', 100, 80);
    touch('touchstart', 100, 100);
    touch('touchmove', 100, 170);
    touch('touchend', 100, 170);
    expect(view.getByRole('status').textContent).toContain('1 de 3: Café da manhã');
    touch('touchstart', 100, 100);
    expect(touch('touchmove', 180, 110).defaultPrevented).toBe(false);
    touch('touchend', 180, 110);
    dom.testing.fireEvent.keyDown(carousel, { key: 'End' });
    touch('touchstart', 100, 200);
    expect(touch('touchmove', 100, 100).defaultPrevented).toBe(true);
    expect(view.getByRole('status').textContent).toBe('Ver cardápio completo');
    touch('touchend', 100, 100);
});
