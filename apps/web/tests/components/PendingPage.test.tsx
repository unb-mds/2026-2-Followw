import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { PendingPage } from '#/components/PendingPage';
import { getRouter } from '#/router';

describe('PendingPage', () => {
    test('renderiza o aviso de carregamento com spinner', () => {
        const markup = renderToStaticMarkup(<PendingPage />);

        expect(markup).toContain('Carregando...');
        expect(markup).toContain('animate-spin');
    });

    test('é a tela de carregamento padrão das rotas', () => {
        const { options } = getRouter();

        expect(options.defaultPendingComponent).toBe(PendingPage);
        expect(options.defaultPendingMs).toBe(200);
    });
});
