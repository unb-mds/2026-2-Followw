import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { FollowwLogo } from '#/components/FollowwLogo';

describe('FollowwLogo', () => {
    test('usa a mesma arte do favicon público sem outra requisição', async () => {
        const markup = renderToStaticMarkup(<FollowwLogo />);
        const favicon = await Bun.file(new URL('../../public/favicon.svg', import.meta.url)).text();

        expect(markup).toContain(`src="data:image/svg+xml,${encodeURIComponent(favicon)}"`);
        expect(markup).toContain('alt="Logo Followw"');
    });

    test('preserva a proporção quadrada ao receber um tamanho', () => {
        const markup = renderToStaticMarkup(<FollowwLogo size={32} />);

        expect(markup).toContain('width="32"');
        expect(markup).toContain('height="32"');
        expect(markup).not.toContain('size-16');
    });
});
