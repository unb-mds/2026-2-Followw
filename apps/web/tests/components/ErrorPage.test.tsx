import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ErrorPage } from '#/components/ErrorPage';
import { ApiError } from '#/queries/errors';

describe('ErrorPage', () => {
    test('renderiza o título de feedback com a identidade do Followw', () => {
        const markup = renderToStaticMarkup(<ErrorPage />);

        expect(markup).toContain('Estamos com problemas no momento');
        expect(markup).toContain('alt="Logo Followw"');
        expect(markup).toContain('Tentar novamente');
        expect(markup).toContain('Voltar ao início');
    });

    test('exibe mensagem padrão quando nenhum erro é especificado', () => {
        const markup = renderToStaticMarkup(<ErrorPage />);

        expect(markup).toContain(
            'Não foi possível carregar as informações. Verifique sua conexão e tente novamente.'
        );
    });

    test('exibe mensagem específica para erros de servidor do SIGAA/API', () => {
        const serverError = new ApiError(500, { detail: 'Internal Server Error' });
        const markup = renderToStaticMarkup(<ErrorPage error={serverError} />);

        expect(markup).toContain(
            'O SIGAA ou nossos servidores estão com problemas. Tente novamente em instantes.'
        );
    });

    test('aceita mensagem customizada via prop', () => {
        const customMessage = 'Falha ao sincronizar notas.';
        const markup = renderToStaticMarkup(<ErrorPage message={customMessage} />);

        expect(markup).toContain(customMessage);
    });
});
