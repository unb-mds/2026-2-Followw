import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { LoadingText } from '#/components/LoadingText';

describe('LoadingText', () => {
    test('renderiza o texto com um spinner animado', () => {
        const markup = renderToStaticMarkup(<LoadingText>Carregando turmas...</LoadingText>);

        expect(markup).toContain('Carregando turmas...');
        expect(markup).toContain('lucide-loader-circle');
        expect(markup).toContain('animate-spin');
    });
});
