import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ListCard, Meter } from '#/components/ListCard';

describe('ListCard', () => {
    test('renderiza como dl quando solicitado', () => {
        const markup = renderToStaticMarkup(
            <ListCard as="dl">
                <div>
                    <dt>Termo</dt>
                    <dd>Valor</dd>
                </div>
            </ListCard>
        );
        expect(markup).toContain('<dl');
        expect(markup).toContain('<dt>Termo</dt>');
        expect(markup).toContain('<dd>Valor</dd>');
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
