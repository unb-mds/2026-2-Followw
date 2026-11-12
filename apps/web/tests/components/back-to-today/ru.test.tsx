import { expect, test } from 'bun:test';

import { restaurantDefaults } from '#/lib/restaurant-share';
import { addDays, nowInBrasilia } from '#/lib/schedule';
import { Route } from '#/routes/_app/ru';

import { useDom } from '../../helpers/dom';
import { appPage } from './helpers';

const dom = useDom();

async function render(url: string, desktop = false) {
    const now = nowInBrasilia();
    const page = appPage({
        route: Route,
        path: 'ru',
        url,
        loaderData: { today: now.date, defaults: restaurantDefaults('Darcy', now) },
        desktop
    });
    await page.router.load();
    return { ...page, view: dom.testing.render(page.element) };
}

const bar = () => dom.testing.screen.queryByRole('toolbar', { name: 'Dia selecionado' });

test('cardápio do dia atual não mostra o atalho para hoje', async () => {
    await render('/ru');
    expect(bar()).toBeNull();
});

test('ao escolher outro dia mostra o atalho e volta para hoje sem data na URL', async () => {
    const { view, router } = await render('/ru');
    const today = restaurantDefaults('Darcy').date;
    dom.testing.fireEvent.click(view.getByRole('button', { name: 'Próximo dia' }));
    await dom.testing.waitFor(() =>
        expect(router.state.location.search).toMatchObject({ date: addDays(today, 1) })
    );
    dom.testing.fireEvent.click(await view.findByRole('button', { name: 'Voltar para hoje' }));
    await dom.testing.waitFor(() =>
        expect(router.state.location.search).not.toHaveProperty('date')
    );
    await dom.testing.waitFor(() => expect(bar()).toBeNull());
});

test('no desktop o atalho para hoje fica oculto mesmo em outro dia', async () => {
    const tomorrow = addDays(restaurantDefaults('Darcy').date, 1);
    await render(`/ru?date=${tomorrow}`, true);
    expect(bar()).toBeNull();
});
