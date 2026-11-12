import { expect, test } from 'bun:test';

import { addDays, nowInBrasilia, weekDays } from '#/lib/schedule';
import { Route } from '#/routes/_app/index';

import { useDom } from '../../helpers/dom';
import { appPage } from './helpers';

const dom = useDom();

async function render() {
    const now = nowInBrasilia();
    const page = appPage({ route: Route, path: '/', url: '/', loaderData: { now } });
    await page.router.load();
    return { now, view: dom.testing.render(page.element) };
}

const bar = () => dom.testing.screen.queryByRole('toolbar', { name: 'Dia selecionado' });

test('início no dia atual não mostra o atalho para hoje', async () => {
    await render();
    expect(bar()).toBeNull();
});

test('ao escolher outro dia da semana mostra o atalho e volta para hoje', async () => {
    const { now, view } = await render();
    const other =
        weekDays(now.date).find((day) => day.date !== now.date)?.date ?? addDays(now.date, 1);
    dom.testing.fireEvent.click(view.getByTitle('Exibir dias da semana'));
    dom.testing.fireEvent.click(view.getByRole('button', { name: other }));
    expect(view.getByRole('button', { name: other }).getAttribute('aria-pressed')).toBe('true');
    dom.testing.fireEvent.click(await view.findByRole('button', { name: 'Voltar para hoje' }));
    expect(view.getByRole('button', { name: now.date }).getAttribute('aria-pressed')).toBe('true');
    await dom.testing.waitFor(() => expect(bar()).toBeNull());
});
