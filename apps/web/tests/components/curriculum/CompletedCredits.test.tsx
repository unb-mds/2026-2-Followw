import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { CompletedCredits } from '#/components/curriculum/CompletedCredits';

test('lista aproveitamentos, dispensas e equivalências nas recomendações', () => {
    const html = renderToStaticMarkup(
        <CompletedCredits
            completedSubjects={{ A: 'approved', B: 'credit', C: 'waived', D: 'equivalence' }}
        />
    );
    expect(html).toContain('B · Aproveitamento');
    expect(html).toContain('C · Dispensa');
    expect(html).toContain('D · Equivalência');
    expect(html).not.toContain('A ·');
});

test('lista somente créditos fora dos períodos exibidos quando aparece no fluxograma', () => {
    const html = renderToStaticMarkup(
        <CompletedCredits
            completedSubjects={{ B: 'credit', C: 'equivalence' }}
            shown={new Map([['B', {}]])}
        />
    );
    expect(html).toContain('C · Equivalência');
    expect(html).not.toContain('B ·');
});
