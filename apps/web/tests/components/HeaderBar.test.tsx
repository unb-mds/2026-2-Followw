import { describe, expect, test } from 'bun:test';

import { BackHeader, HeaderBar, HeaderTitle } from '#/components/HeaderBar';

import { renderWithRouter } from '../helpers/router';

describe('HeaderBar', () => {
    test('renderiza título e conteúdo', () => {
        const html = renderWithRouter(
            <HeaderBar>
                <HeaderTitle>Página de Teste</HeaderTitle>
            </HeaderBar>
        );

        expect(html).toContain('Página de Teste');
    });
});

describe('BackHeader', () => {
    test('renderiza botão de voltar e título da página', () => {
        const html = renderWithRouter(<BackHeader to="/turmas" title="Minhas Turmas" />);

        expect(html).toContain('Minhas Turmas');
        expect(html).toContain('href="/turmas"');
        expect(html).toContain('aria-label="Voltar"');
    });

    test('permite customizar aria-label do link de voltar', () => {
        const html = renderWithRouter(
            <BackHeader to="/buscar" title="Docente" ariaLabel="Voltar para busca" />
        );

        expect(html).toContain('Docente');
        expect(html).toContain('href="/buscar"');
        expect(html).toContain('aria-label="Voltar para busca"');
    });
});
