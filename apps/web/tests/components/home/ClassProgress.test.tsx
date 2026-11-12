import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ClassProgress } from '#/components/home/ClassProgress';

describe('ClassProgress', () => {
    test('enche a barra conforme o andamento da aula, em verde', () => {
        const markup = renderToStaticMarkup(<ClassProgress progress={0.5} absent={false} />);
        expect(markup).toContain('height:50%');
        expect(markup).toContain('bg-primary');
        expect(markup).not.toContain('bg-destructive');
    });

    test('fica vermelha quando houve falta no dia', () => {
        const markup = renderToStaticMarkup(<ClassProgress progress={1} absent />);
        expect(markup).toContain('height:100%');
        expect(markup).toContain('bg-destructive');
    });
});
