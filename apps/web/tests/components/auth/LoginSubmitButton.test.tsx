import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { LoginSubmitButton } from '#/components/auth/LoginSubmitButton';

describe('LoginSubmitButton', () => {
    test('mostra a ação de entrada quando está livre', () => {
        const markup = renderToStaticMarkup(<LoginSubmitButton pending={false} />);

        expect(markup).toContain('>Entrar</button>');
        expect(markup).toContain('aria-busy="false"');
        expect(markup).not.toContain('data-slot="progress"');
        expect(markup).not.toContain('disabled=""');
    });

    test('bloqueia novos envios e exibe a barra de progresso durante o login', () => {
        const markup = renderToStaticMarkup(<LoginSubmitButton pending />);

        expect(markup).toContain('Entrando...</span>');
        expect(markup).toContain('aria-busy="true"');
        expect(markup).toContain('disabled=""');
        expect(markup).toContain('data-slot="progress"');
        expect(markup).toContain('aria-hidden="true"');
    });
});
