import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { LoginSubmitButton } from '#/components/auth/LoginSubmitButton';

describe('LoginSubmitButton', () => {
    test('mostra a ação de entrada quando está livre', () => {
        const markup = renderToStaticMarkup(<LoginSubmitButton pending={false} />);

        expect(markup).toContain('Entrar');
        expect(markup).toContain('aria-busy="false"');
        expect(markup).not.toContain('disabled=""');
    });

    test('bloqueia novos envios e informa que o login está em andamento', () => {
        const markup = renderToStaticMarkup(<LoginSubmitButton pending />);

        expect(markup).toContain('Entrando...');
        expect(markup).toContain('aria-busy="true"');
        expect(markup).toContain('disabled=""');
        expect(markup).toContain('aria-hidden="true"');
    });
});
