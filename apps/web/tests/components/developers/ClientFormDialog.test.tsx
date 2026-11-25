import type {
    OAuthClient,
    OAuthClientCreate,
    OAuthClientUpdate
} from '@followw/core/queries/oauth.ts';

import { ApiError } from '@followw/core/queries/errors.ts';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { mockBrowserLayoutEffect } from '../../helpers/base-ui';
import { useDom } from '../../helpers/dom';

const dom = useDom();

let ClientFormDialog: typeof import('#/components/developers/ClientFormDialog').ClientFormDialog;
let restoreLayoutEffect: (() => Promise<void>) | undefined;

beforeAll(async () => {
    restoreLayoutEffect = await mockBrowserLayoutEffect();
    ({ ClientFormDialog } = await import('#/components/developers/ClientFormDialog'));
});

afterAll(async () => {
    await restoreLayoutEffect?.();
});

describe('ClientFormDialog', () => {
    test('alterna estado acessível Pública/Confidencial e envia criação válida', async () => {
        const { render, fireEvent, waitFor } = dom.testing;
        const submitted: OAuthClientCreate[] = [];
        let closed = false;

        const view = render(
            <ClientFormDialog
                mode="create"
                open
                onOpenChange={(open) => {
                    if (!open) closed = true;
                }}
                onSubmit={async (body) => {
                    submitted.push(body);
                }}
            />
        );

        const publicRadio = view.getByRole('radio', { name: /Pública/i });
        const confidentialRadio = view.getByRole('radio', { name: /Confidencial/i });
        expect(publicRadio.getAttribute('aria-checked')).toBe('true');
        expect(confidentialRadio.getAttribute('aria-checked')).toBe('false');

        fireEvent.click(confidentialRadio);
        expect(publicRadio.getAttribute('aria-checked')).toBe('false');
        expect(confidentialRadio.getAttribute('aria-checked')).toBe('true');

        fireEvent.change(view.getByLabelText('Nome da aplicação'), {
            target: { value: 'Bot UnB' }
        });
        fireEvent.change(view.getByLabelText('URI de redirecionamento 1'), {
            target: { value: 'http://[::1]:3000/callback' }
        });
        fireEvent.click(view.getByRole('button', { name: /Adicionar URI/i }));
        fireEvent.change(view.getByLabelText('URI de redirecionamento 2'), {
            target: { value: 'https://bot.unb.dev/cb' }
        });

        fireEvent.click(view.getByRole('button', { name: 'Criar aplicação' }));

        await waitFor(() => expect(submitted).toHaveLength(1));
        expect(submitted[0]).toEqual({
            name: 'Bot UnB',
            description: null,
            homepage_url: null,
            confidential: true,
            redirect_uris: ['http://[::1]:3000/callback', 'https://bot.unb.dev/cb']
        });
        expect(closed).toBe(true);
    });

    test('só a primeira URI é obrigatória e linhas extras vazias são ignoradas', async () => {
        const { render, fireEvent, waitFor } = dom.testing;
        const submitted: OAuthClientCreate[] = [];

        const view = render(
            <ClientFormDialog
                mode="create"
                open
                onOpenChange={() => {}}
                onSubmit={async (body) => {
                    submitted.push(body);
                }}
            />
        );

        fireEvent.change(view.getByLabelText('Nome da aplicação'), {
            target: { value: 'Bot UnB' }
        });
        fireEvent.change(view.getByLabelText('URI de redirecionamento 1'), {
            target: { value: 'https://bot.unb.dev/cb' }
        });
        fireEvent.click(view.getByRole('button', { name: /Adicionar URI/i }));

        expect(view.getByLabelText('URI de redirecionamento 1')).toHaveProperty('required', true);
        expect(view.getByLabelText('URI de redirecionamento 2')).toHaveProperty('required', false);

        fireEvent.click(view.getByRole('button', { name: 'Criar aplicação' }));
        await waitFor(() => expect(submitted).toHaveLength(1));
        expect(submitted[0]?.redirect_uris).toEqual(['https://bot.unb.dev/cb']);
    });

    test('exibe erro retornado pela API ao falhar na criação', async () => {
        const { render, fireEvent, waitFor } = dom.testing;

        const view = render(
            <ClientFormDialog
                mode="create"
                open
                onOpenChange={() => {}}
                onSubmit={async () => {
                    throw new ApiError(422, 'Limite de 10 aplicações por conta atingido.');
                }}
            />
        );

        fireEvent.change(view.getByLabelText('Nome da aplicação'), {
            target: { value: 'App Extra' }
        });
        fireEvent.change(view.getByLabelText('URI de redirecionamento 1'), {
            target: { value: 'https://extra.unb.dev/cb' }
        });
        fireEvent.click(view.getByRole('button', { name: 'Criar aplicação' }));

        await waitFor(() =>
            expect(view.getByRole('alert').textContent).toContain(
                'Limite de 10 aplicações por conta atingido.'
            )
        );
    });

    test('modo edição pré-preenche dados, oculta seletor de tipo e envia atualização', async () => {
        const { render, fireEvent, waitFor } = dom.testing;
        const updated: OAuthClientUpdate[] = [];

        const existing: OAuthClient = {
            client_id: 'flw_app_1',
            name: 'App Original',
            description: 'Descrição inicial',
            homepage_url: 'https://app.unb.dev',
            confidential: false,
            redirect_uris: ['meuapp://cb'],
            created_at: '2026-11-24T00:00:00Z',
            updated_at: '2026-11-24T00:00:00Z'
        };

        const view = render(
            <ClientFormDialog
                mode="edit"
                client={existing}
                open
                onOpenChange={() => {}}
                onSubmit={async (body) => {
                    updated.push(body);
                }}
            />
        );

        expect(view.queryByRole('radio')).toBeNull();
        expect(view.getByDisplayValue('App Original')).toBeDefined();

        fireEvent.change(view.getByLabelText('Nome da aplicação'), {
            target: { value: 'App Renomeado' }
        });
        fireEvent.click(view.getByRole('button', { name: 'Salvar alterações' }));

        await waitFor(() => expect(updated).toHaveLength(1));
        expect(updated[0]).toEqual({
            name: 'App Renomeado',
            description: 'Descrição inicial',
            homepage_url: 'https://app.unb.dev',
            redirect_uris: ['meuapp://cb']
        });
    });
});
