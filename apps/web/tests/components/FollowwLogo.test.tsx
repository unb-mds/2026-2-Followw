import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { FollowwLogo } from '#/components/FollowwLogo';

import manifest from '../../public/manifest.json';

describe('FollowwLogo', () => {
    test('usa o favicon da aplicação com um nome acessível', () => {
        const favicon = manifest.icons[0];
        const markup = renderToStaticMarkup(<FollowwLogo />);

        expect(markup).toContain(`src="${favicon.src}"`);
        expect(markup).toContain('alt="Logo Followw"');
    });

    test('preserva a proporção quadrada ao receber um tamanho', () => {
        const markup = renderToStaticMarkup(<FollowwLogo size={32} />);

        expect(markup).toContain('width="32"');
        expect(markup).toContain('height="32"');
        expect(markup).not.toContain('size-16');
    });
});
