import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ListCard, Meter } from '#/components/ListCard';

describe('ListCard', () => {
    test('renderiza os itens separados por divisórias', () => {
        const markup = renderToStaticMarkup(
            <ListCard className="mt-2">
                <p>Item</p>
            </ListCard>
        );
        expect(markup).toContain('divide-y');
        expect(markup).toContain('mt-2');
        expect(markup).toContain('<p>Item</p>');
    });
});

describe('Meter', () => {
    test('mostra o percentual no padrão brasileiro e o detalhe', () => {
        const markup = renderToStaticMarkup(
            <Meter label="Integralização" value={62.5} detail="10h de 16h" />
        );
        expect(markup).toContain('Integralização');
        expect(markup).toContain('62,5%');
        expect(markup).toContain('10h de 16h');
    });

    test('limita a barra entre 0 e 100 sem alterar o valor exibido', () => {
        const markup = renderToStaticMarkup(<Meter label="Presença" value={120} />);
        expect(markup).toContain('120%');
        expect(markup).toContain('aria-valuenow="100"');
    });
});
