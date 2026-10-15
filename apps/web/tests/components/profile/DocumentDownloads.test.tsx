import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { DocumentDownloads } from '#/components/profile/DocumentDownloads';

describe('DocumentDownloads', () => {
    test('oferece os dois downloads na ordem solicitada', () => {
        const queryClient = new QueryClient();
        const markup = renderToStaticMarkup(
            <QueryClientProvider client={queryClient}>
                <DocumentDownloads />
            </QueryClientProvider>
        );
        expect(markup.match(/<button\b/g)).toHaveLength(4);
        expect(markup).toContain('aria-label="Baixar carteirinha estudantil"');
        expect(markup).toContain('aria-label="Preparar para compartilhar carteirinha estudantil"');
        expect(markup).toContain('aria-label="Baixar histórico acadêmico"');
        expect(markup).toContain('aria-label="Preparar para compartilhar histórico acadêmico"');
        expect(markup.indexOf('Carteirinha estudantil')).toBeLessThan(
            markup.indexOf('Histórico acadêmico')
        );
        queryClient.clear();
    });
});
