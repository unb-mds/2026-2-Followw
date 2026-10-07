import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { PersonPhoto } from '#/components/ui/person-photo';

describe('PersonPhoto', () => {
    test('mostra a foto em 3:4 nos dois tamanhos', () => {
        const small = renderToStaticMarkup(<PersonPhoto src="https://foto" />);
        const large = renderToStaticMarkup(<PersonPhoto src="https://foto" size="lg" />);

        expect(small).toContain('aspect-3/4');
        expect(small).toContain('w-9');
        expect(large).toContain('aspect-3/4');
        expect(large).toContain('w-20');
        expect(small).toContain('src="https://foto"');
        expect(large).toContain('src="https://foto"');
    });

    test('mostra o avatar quando não há foto', () => {
        const markup = renderToStaticMarkup(<PersonPhoto src={null} />);

        expect(markup).not.toContain('<img');
        expect(markup).toContain('aspect-3/4');
        expect(markup).toContain('w-9');
        expect(markup).toContain('aria-hidden="true"');
    });
});
