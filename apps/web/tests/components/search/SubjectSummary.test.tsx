import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { CatalogSubject } from '#/queries/subjects';

import { SubjectSummary } from '#/components/search/SubjectSummary';

const subject: CatalogSubject = {
    code: 'FGA0313',
    name: 'REQUISITOS DE SOFTWARE',
    classrooms: []
};

test.each(['mandatory', 'optional', 'free'] as const)(
    'posiciona as cápsulas abaixo do nome para %s',
    (kind) => {
        const container = renderToStaticMarkup(
            <SubjectSummary subject={{ ...subject, kind, curriculum_period: 3 }} />
        );
        expect(container.indexOf(subject.code)).toBeLessThan(container.indexOf(subject.name));
        expect(container.indexOf(subject.name)).toBeLessThan(
            container.indexOf('data-slot="badge"')
        );
        expect(container).toContain('3º semestre');
        expect(container.match(/data-slot="badge"/g)).toHaveLength(2);
    }
);

test.each([null, undefined, 0])(
    'omite semestre sem período definido no fluxo (%s)',
    (curriculum_period) => {
        const markup = renderToStaticMarkup(
            <SubjectSummary subject={{ ...subject, kind: 'free', curriculum_period }} />
        );
        expect(markup).toContain('Módulo livre');
        expect(markup).not.toContain('semestre');
    }
);

test('visitante sem tipo ou fluxo vê apenas código e nome', () => {
    const markup = renderToStaticMarkup(<SubjectSummary subject={subject} />);
    expect(markup).toContain(subject.name);
    expect(markup).not.toContain('data-slot="badge"');
});

test.each([
    [3, 'destructive', 'text-destructive'],
    [4, 'destructive', 'text-destructive'],
    [5, 'default', 'text-primary']
] as const)('colore o semestre %s em relação ao período atual 4', (period, variant, color) => {
    const markup = renderToStaticMarkup(
        <SubjectSummary subject={{ ...subject, curriculum_period: period }} currentPeriod={4} />
    );
    expect(markup).toContain(`data-variant="${variant}"`);
    expect(markup).toContain(color);
});

test('mantém semestre neutro quando o período atual é desconhecido', () => {
    const markup = renderToStaticMarkup(
        <SubjectSummary subject={{ ...subject, curriculum_period: 3 }} currentPeriod={null} />
    );
    expect(markup).toContain('data-variant="outline"');
    expect(markup).not.toContain('text-destructive');
});
