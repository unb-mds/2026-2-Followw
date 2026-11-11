import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { FollowwLogo } from '#/components/FollowwLogo';

describe('FollowwLogo', () => {
    test('reutiliza a arte do favicon sem pedir o arquivo de novo', () => {
        const markup = renderToStaticMarkup(<FollowwLogo />);

        expect(markup).toContain('src="data:image/svg+xml,');
        expect(markup).toContain('alt="Logo Followw"');
    });

    test('preserva a proporção quadrada ao receber um tamanho', () => {
        const markup = renderToStaticMarkup(<FollowwLogo size={32} />);

        expect(markup).toContain('width="32"');
        expect(markup).toContain('height="32"');
        expect(markup).not.toContain('size-16');
    });
});
