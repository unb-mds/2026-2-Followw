import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Markdown } from '#/lib/markdown';

function render(content: string) {
    return renderToStaticMarkup(<Markdown>{content}</Markdown>);
}

describe('Markdown', () => {
    test('renderiza títulos, ênfase, listas, citações e código', () => {
        const markup = render(
            '# Notícia\n\n**Importante** e *ênfase*\n\n- Primeiro\n- Segundo\n\n1. Passo\n\n> Aviso\n\n`código`\n\n```\nexemplo\n```'
        );

        expect(markup).toContain('<h1>Notícia</h1>');
        expect(markup).toContain('<strong>Importante</strong>');
        expect(markup).toContain('<em>ênfase</em>');
        expect(markup).toContain('<ul>');
        expect(markup).toContain('<li>Primeiro</li>');
        expect(markup).toContain('<ol>');
        expect(markup).toContain('<blockquote>');
        expect(markup).toContain('<code>código</code>');
        expect(markup).toContain('<pre><code>exemplo');
    });

    test('renderiza tabelas e links automáticos', () => {
        const markup = render('| A | B |\n| --- | --- |\n| 1 | 2 |\n\nhttps://unb.br');

        expect(markup).toContain('<table>');
        expect(markup).toContain('<th>A</th>');
        expect(markup).toContain('<td>2</td>');
        expect(markup).toContain('href="https://unb.br" target="_blank"');
    });

    test.each(['https://unb.br', 'http://unb.br', '//unb.br', 'mailto:contato@unb.br'])(
        'abre link externo %s em nova aba com proteção de opener',
        (url) => {
            const markup = render(`[UnB](${url})`);

            expect(markup).toContain(`href="${url}"`);
            expect(markup).toContain('target="_blank"');
            expect(markup).toContain('rel="external noopener noreferrer"');
        }
    );

    test.each(['/turmas', '#aviso', './arquivo'])('mantém link relativo %s na aba atual', (url) => {
        const markup = render(`[Local](${url})`);

        expect(markup).toContain(`href="${url}"`);
        expect(markup).not.toContain('target=');
        expect(markup).not.toContain('rel=');
    });

    test('descarta HTML com scripts, eventos e iframes', () => {
        const markup = render(
            '<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n<iframe src="https://unb.br"></iframe>\n\nTexto **seguro**'
        );

        expect(markup).not.toContain('<script');
        expect(markup).not.toContain('<img');
        expect(markup).not.toContain('onerror');
        expect(markup).not.toContain('<iframe');
        expect(markup).toContain('<strong>seguro</strong>');
    });

    test.each([
        'javascript:alert%281%29',
        'JaVaScRiPt:alert%281%29',
        'vbscript:msgbox%281%29',
        'data:text/html;base64,PHNjcmlwdD4='
    ])('bloqueia URL perigosa %s em links e imagens', (url) => {
        const markup = render(`[Link](${url})\n\n![Imagem](${url})`);

        expect(markup).not.toContain(url);
        expect(markup).not.toContain('target="_blank"');
    });

    test('escapa HTML dentro de blocos de código', () => {
        const markup = render('```html\n<script>alert(1)</script>\n```');

        expect(markup).toContain('&lt;script&gt;');
        expect(markup).not.toContain('<script>');
    });
});
