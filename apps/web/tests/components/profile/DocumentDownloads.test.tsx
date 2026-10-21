import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { DocumentDownloads } from '#/components/profile/DocumentDownloads';

describe('DocumentDownloads', () => {
    test('oferece os três documentos no perfil', () => {
        const queryClient = new QueryClient();
        const markup = renderToStaticMarkup(
            <QueryClientProvider client={queryClient}>
                <DocumentDownloads />
            </QueryClientProvider>
        );
        expect(markup.match(/<button\b/g)).toHaveLength(3);
        expect(markup).toContain('aria-label="Baixar carteirinha estudantil"');
        expect(markup).toContain('aria-label="Baixar histórico acadêmico"');
        expect(markup).toContain('aria-label="Baixar atestado de matrícula"');
        expect(markup).not.toMatch(/compartilhar/i);
        expect(markup.indexOf('Carteirinha estudantil')).toBeLessThan(
            markup.indexOf('Histórico acadêmico')
        );
        queryClient.clear();
    });
});
