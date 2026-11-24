import type { OAuthGrant } from '@followw/core/queries/oauth.ts';

import { oauthGrantsQueryOptions } from '@followw/core/queries/oauth.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { renderToStaticMarkup } from 'react-dom/server';

import { ConnectedAppsSection } from '#/components/profile/ConnectedAppsSection';

test('exibe estado vazio quando não há aplicativos conectados', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(oauthGrantsQueryOptions.queryKey, []);
    const browser = new Window();
    try {
        browser.document.body.innerHTML = renderToStaticMarkup(
            <QueryClientProvider client={client}>
                <ConnectedAppsSection />
            </QueryClientProvider>
        );
        expect(browser.document.body.textContent).toContain('Apps conectados');
        expect(browser.document.body.textContent).toContain(
            'Nenhum aplicativo de terceiros possui acesso à sua conta.'
        );
    } finally {
        browser.close();
    }
});

test('exibe aplicativos autorizados, escopos legíveis e botão de revogação', async () => {
    const grants: OAuthGrant[] = [
        {
            id: '11111111-1111-1111-1111-111111111111',
            client_id: 'flw_app_abc',
            client_name: 'Planejador UnB',
            client_description: 'Organiza sua grade',
            client_homepage_url: 'https://planejador.unb.dev',
            confidential: true,
            scopes: ['profile:read', 'classrooms:read'],
            created_at: '2026-11-24T00:00:00Z',
            expires_at: '2026-12-08T00:00:00Z'
        }
    ];
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(oauthGrantsQueryOptions.queryKey, grants);
    const browser = new Window();
    try {
        browser.document.body.innerHTML = renderToStaticMarkup(
            <QueryClientProvider client={client}>
                <ConnectedAppsSection />
            </QueryClientProvider>
        );
        const text = browser.document.body.textContent;
        expect(text).toContain('Planejador UnB');
        expect(text).toContain('Ler nome, matrícula, foto e curso');
        expect(text).toContain('Ler turmas atuais e horários das aulas');
        expect(text).toContain('Revogar');
    } finally {
        browser.close();
    }
});
