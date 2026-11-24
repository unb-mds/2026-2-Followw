import type { OAuthClient } from '@followw/core/queries/oauth.ts';

import { afterAll, beforeAll, expect, test } from 'bun:test';

import { mockBrowserLayoutEffect } from '../../helpers/base-ui';
import { useDom } from '../../helpers/dom';

const dom = useDom();

let ClientCard: typeof import('#/components/developers/ClientCard').ClientCard;
let restoreLayoutEffect: (() => Promise<void>) | undefined;

beforeAll(async () => {
    restoreLayoutEffect = await mockBrowserLayoutEffect();
    ({ ClientCard } = await import('#/components/developers/ClientCard'));
});

afterAll(async () => {
    await restoreLayoutEffect?.();
});

const client: OAuthClient = {
    id: 'flw_app_c',
    name: 'Bot UnB',
    description: null,
    homepage_url: null,
    confidential: true,
    redirect_uris: ['https://a.dev/cb'],
    created_at: '2026-11-24T00:00:00Z',
    updated_at: '2026-11-24T00:00:00Z'
};

function renderCard(app: OAuthClient, handlers: { onDelete?: () => void } = {}) {
    return dom.testing.render(
        <ClientCard
            client={app}
            disabled={false}
            onEdit={() => {}}
            onRotateSecret={() => {}}
            onDelete={handlers.onDelete ?? (() => {})}
        />
    );
}

async function openMenu(view: ReturnType<typeof renderCard>, name: string) {
    const { fireEvent, waitFor } = dom.testing;
    fireEvent.click(view.getByRole('button', { name: `Ações de ${name}` }));
    await waitFor(() => expect(view.getAllByRole('menuitem').length).toBeGreaterThan(0));
    return view.getAllByRole('menuitem');
}

test('menu da aplicação confidencial inclui rotacionar segredo', async () => {
    const items = await openMenu(renderCard(client), 'Bot UnB');
    expect(items.map((item) => item.textContent)).toEqual([
        'Editar',
        'Rotacionar segredo',
        'Excluir'
    ]);
});

test('menu da aplicação pública não oferece rotacionar segredo', async () => {
    const items = await openMenu(renderCard({ ...client, confidential: false }), 'Bot UnB');
    expect(items.map((item) => item.textContent)).toEqual(['Editar', 'Excluir']);
});

test('excluir é destructive e só age depois da confirmação', async () => {
    const { fireEvent, waitFor } = dom.testing;
    let deleted = 0;
    const view = renderCard(client, { onDelete: () => deleted++ });
    const items = await openMenu(view, 'Bot UnB');
    const excluir = items.find((item) => item.textContent === 'Excluir');
    expect(excluir?.getAttribute('data-variant')).toBe('destructive');

    fireEvent.click(excluir!);
    await waitFor(() => expect(view.getByRole('alertdialog')).toBeTruthy());
    expect(deleted).toBe(0);

    fireEvent.click(view.getByRole('button', { name: 'Excluir aplicação' }));
    expect(deleted).toBe(1);
});
