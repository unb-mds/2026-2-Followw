import { STORAGE_KEYS } from '@followw/core/lib/storage-keys.ts';
import { onlineManager } from '@tanstack/react-query';
import { expect, test } from 'bun:test';

import { STORAGE_PREFIX } from '#/lib/local-storage';
import { meQueryOptions } from '#/queries/me';

import { createDeletionFixture, PROFILE } from './helpers';

const fixture = createDeletionFixture();

async function confirm() {
    const page = await fixture.render();
    const checkbox = await page.findByRole('checkbox');
    await fixture.dom.testing.act(async () => fixture.dom.testing.fireEvent.click(checkbox));
    fixture.dom.testing.fireEvent.click(page.getByRole('button', { name: 'Excluir meus dados' }));
    const dialog = await page.findByRole('alertdialog');
    return { page, dialog, within: fixture.dom.testing.within(dialog) };
}

test('exige ciência dos dados e confirmação final antes de excluir', async () => {
    const page = await fixture.render();
    const button = await page.findByRole('button', { name: 'Excluir meus dados' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(fixture.deletions).toHaveLength(0);
    const checkbox = page.getByRole('checkbox');
    await fixture.dom.testing.act(async () => fixture.dom.testing.fireEvent.click(checkbox));
    fixture.dom.testing.fireEvent.click(button);
    const dialog = await page.findByRole('alertdialog');
    expect(fixture.deletions).toHaveLength(0);
    await fixture.dom.testing.act(async () =>
        fixture.dom.testing.fireEvent.click(
            fixture.dom.testing.within(dialog).getByRole('button', { name: 'Cancelar' })
        )
    );
    expect(dialog.hasAttribute('data-closed')).toBe(true);
    expect(fixture.deletions).toHaveLength(0);
});

test('limpa os dados locais após sucesso sem chamar logout e mostra conclusão', async () => {
    fixture.client.setQueryData(meQueryOptions.queryKey, PROFILE);
    fixture.client.setQueryData(['get', '/classrooms'], ['privado']);
    localStorage.setItem(`${STORAGE_PREFIX}${STORAGE_KEYS.SCHEDULE}`, JSON.stringify(['grade']));
    const { page, within } = await confirm();
    await fixture.dom.testing.act(async () =>
        fixture.dom.testing.fireEvent.click(
            within.getByRole('button', { name: 'Confirmar exclusão' })
        )
    );
    expect(await page.findByText('Exclusão concluída')).toBeTruthy();
    expect(document.activeElement).toBe(page.getByRole('heading', { name: 'Exclusão concluída' }));
    expect(fixture.deletions).toHaveLength(1);
    expect(new URL(fixture.deletions[0].url).pathname).toBe('/api/me/data');
    expect(fixture.client.getQueryData(meQueryOptions.queryKey)).toBeUndefined();
    expect(fixture.client.getQueryData(['get', '/classrooms'])).toBeUndefined();
    expect(localStorage.getItem(`${STORAGE_PREFIX}${STORAGE_KEYS.SCHEDULE}`)).toBeNull();
    expect(page.queryByRole('checkbox')).toBeNull();
    expect(page.getAllByRole('heading')).toHaveLength(1);
    expect(page.getByRole('link', { name: 'Voltar ao início' }).getAttribute('href')).toBe('/');
    expect(page.queryByRole('heading', { name: 'O que será mantido' })).toBeNull();
    expect(page.container.querySelector('svg')).toBeNull();
});

test('mantém os dados após falha e permite repetir a confirmação', async () => {
    fixture.client.setQueryData(['get', '/classrooms'], ['privado']);
    fixture.response = () => Response.json({ detail: 'Falha' }, { status: 500 });
    const { page, within } = await confirm();
    await fixture.dom.testing.act(async () =>
        fixture.dom.testing.fireEvent.click(
            within.getByRole('button', { name: 'Confirmar exclusão' })
        )
    );
    expect((await page.findByRole('alert')).textContent).toContain('Não foi possível concluir');
    expect(fixture.client.getQueryData(['get', '/classrooms'])).toEqual(['privado']);
    fixture.response = () => new Response(null, { status: 204 });
    await fixture.dom.testing.act(async () =>
        fixture.dom.testing.fireEvent.click(
            within.getByRole('button', { name: 'Confirmar exclusão' })
        )
    );
    expect(await page.findByText('Exclusão concluída')).toBeTruthy();
    expect(fixture.deletions).toHaveLength(2);
});

test('bloqueia exclusão offline mesmo depois de abrir a confirmação', async () => {
    const { within } = await confirm();
    await fixture.dom.testing.act(async () => onlineManager.setOnline(false));
    expect(
        within.getByRole('button', { name: 'Confirmar exclusão' }).hasAttribute('disabled')
    ).toBe(true);
    expect(fixture.deletions).toHaveLength(0);
});

test('impede envios duplicados enquanto a exclusão está pendente', async () => {
    const { promise, resolve } = Promise.withResolvers<Response>();
    fixture.response = () => promise;
    const { page, within } = await confirm();
    await fixture.dom.testing.act(async () =>
        fixture.dom.testing.fireEvent.click(
            within.getByRole('button', { name: 'Confirmar exclusão' })
        )
    );
    const pending = await page.findByRole('button', { name: 'Excluindo…' });
    fixture.dom.testing.fireEvent.click(pending);
    expect(pending.hasAttribute('disabled')).toBe(true);
    expect(fixture.deletions).toHaveLength(1);
    await fixture.dom.testing.act(async () => resolve(new Response(null, { status: 204 })));
    expect(await page.findByText('Exclusão concluída')).toBeTruthy();
});
