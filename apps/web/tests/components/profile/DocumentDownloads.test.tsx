import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { DocumentDownloads } from '#/components/profile/DocumentDownloads';
import { useDownloadDocument } from '#/queries/documents';

function Downloads() {
    return <DocumentDownloads download={useDownloadDocument()} />;
}

describe('DocumentDownloads', () => {
    test('oferece os downloads em ordem alfabética, com o diploma desativado', () => {
        const queryClient = new QueryClient();
        const markup = renderToStaticMarkup(
            <QueryClientProvider client={queryClient}>
                <Downloads />
            </QueryClientProvider>
        );
        expect(markup.match(/<button\b/g)).toHaveLength(3);
        expect(markup).toContain('aria-label="Baixar carteirinha estudantil"');
        expect(markup).toContain('aria-label="Baixar histórico acadêmico"');
        expect(markup).not.toMatch(/compartilhar/i);
        expect(markup).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Baixar diploma"/);
        expect(markup.indexOf('>Carteirinha<')).toBeLessThan(markup.indexOf('>Diploma<'));
        expect(markup.indexOf('>Diploma<')).toBeLessThan(markup.indexOf('>Histórico<'));
        queryClient.clear();
    });
});
