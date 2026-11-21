import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { LoadingSkeleton } from '#/components/LoadingSkeleton';
import { QueryState } from '#/components/QueryState';
import { Skeleton } from '#/components/ui/skeleton';

function PendingQuery({ skeleton }: { skeleton?: React.ReactNode }) {
    const query = useQuery({ queryKey: ['pendente'], queryFn: () => new Promise<never>(() => {}) });
    return (
        <QueryState
            query={query}
            loading="Buscando..."
            error="Falhou."
            stale="Desatualizado."
            skeleton={skeleton}
        />
    );
}

const render = (skeleton?: React.ReactNode) =>
    renderToStaticMarkup(
        <QueryClientProvider client={new QueryClient()}>
            <PendingQuery skeleton={skeleton} />
        </QueryClientProvider>
    );

describe('esboço de carregamento', () => {
    test('anuncia o carregamento só para leitores de tela', () => {
        const markup = renderToStaticMarkup(
            <LoadingSkeleton label="Carregando turmas...">
                <Skeleton />
            </LoadingSkeleton>
        );

        expect(markup).toContain('<output');
        expect(markup).toContain('<span class="sr-only">Carregando turmas...</span>');
        expect(markup).toContain('data-slot="skeleton"');
    });

    test('com esboço, a consulta pendente mostra o skeleton no lugar do spinner', () => {
        const markup = render(<Skeleton />);

        expect(markup).toContain('data-slot="skeleton"');
        expect(markup).not.toContain('animate-spin');
    });

    test('sem esboço, o layout é incerto e a consulta mantém o spinner', () => {
        const markup = render();

        expect(markup).toContain('animate-spin');
        expect(markup).toContain('Buscando...');
    });
});
