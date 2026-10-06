import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ThemeToggle } from '#/components/ThemeToggle';

describe('ThemeToggle', () => {
    test('renderiza um botão só com ícone, começando no tema do sistema', () => {
        const markup = renderToStaticMarkup(<ThemeToggle />);

        expect(markup).toMatch(/<button\b[^>]*aria-label="Tema: Sistema. Alternar tema"/);
        expect(markup).toContain('lucide-sun-moon');
        expect(markup.match(/<svg\b/g)).toHaveLength(1);
    });
});
