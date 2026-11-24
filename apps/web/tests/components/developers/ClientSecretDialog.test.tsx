import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { mockBrowserLayoutEffect } from '../../helpers/base-ui';
import { useDom } from '../../helpers/dom';

const dom = useDom();

let ClientSecretDialog: typeof import('#/components/developers/ClientSecretDialog').ClientSecretDialog;
let restoreLayoutEffect: (() => Promise<void>) | undefined;

beforeAll(async () => {
    restoreLayoutEffect = await mockBrowserLayoutEffect();
    ({ ClientSecretDialog } = await import('#/components/developers/ClientSecretDialog'));
});

afterAll(async () => {
    await restoreLayoutEffect?.();
});

describe('ClientSecretDialog', () => {
    test('exibe client_id, client_secret e fecha ao confirmar leitura', () => {
        const { render, fireEvent } = dom.testing;
        let closed = false;

        const view = render(
            <ClientSecretDialog
                open
                onOpenChange={(open) => {
                    if (!open) closed = true;
                }}
                clientId="flw_app_abc123"
                clientSecret="flw_sec_segredo_unico"
                title="Novo client_secret gerado"
            />
        );

        expect(view.getByText('Novo client_secret gerado')).toBeDefined();
        expect(view.getByText('flw_app_abc123')).toBeDefined();
        expect(view.getByText('flw_sec_segredo_unico')).toBeDefined();
        expect(view.getByText(/armazena apenas o hash criptográfico/i)).toBeDefined();

        fireEvent.click(view.getByRole('button', { name: 'Entendi, já salvei' }));
        expect(closed).toBe(true);
    });

    test('não fecha com Esc nem oferece botão de fechar', () => {
        const { render, fireEvent } = dom.testing;
        let closed = false;

        const view = render(
            <ClientSecretDialog
                open
                onOpenChange={(open) => {
                    if (!open) closed = true;
                }}
                clientId="flw_app_abc123"
                clientSecret="flw_sec_segredo_unico"
            />
        );

        fireEvent.keyDown(view.getByRole('dialog'), { key: 'Escape' });
        expect(closed).toBe(false);
        expect(view.queryByRole('button', { name: 'Close' })).toBeNull();
    });
});
