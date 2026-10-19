import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { CatalogSubject, Requirements } from '#/queries/subjects';

import { RequirementList } from '#/components/search/RequirementList';
import { TurmaDetails } from '#/components/search/TurmaDetails';
import { prerequisitesMet } from '#/queries/subjects';

const requirements: Requirements = [
    [{ code: 'OLD', subject: { code: 'OLD', name: 'Nome antigo' } }],
    [{ code: 'CURRENT', subject: { code: 'CURRENT', name: 'Nome atual' } }]
];

const renderDetails = (subject: Partial<CatalogSubject>) =>
    renderToStaticMarkup(
        <TurmaDetails
            subject={{ code: 'TARGET', name: 'Disciplina', classrooms: [], ...subject }}
            classroom={{ number: '01', semester: '2026.2', professors: [] }}
            prerequisitesMet={true}
        />
    );

test.each(['prerequisites', 'corequisites'] as const)(
    '%s exibe apenas as alternativas da matriz informadas pela API',
    (field) => {
        const markup = renderDetails({
            [field]: requirements,
            [`curriculum_${field}`]: [requirements[1]]
        });
        expect(markup).toContain('Nome atual');
        expect(markup).not.toContain('Nome antigo');
        expect(markup).not.toContain('Devem ser cumpridos antes de cursar esta matéria.');
        expect(markup).not.toContain('<details');
        expect(markup).not.toContain('<summary');
        expect(markup).not.toContain('Alternativa 1');
        expect(markup).not.toContain('Todas as disciplinas abaixo são necessárias.');
        expect(prerequisitesMet(requirements, new Set(['OLD']))).toBe(true);
    }
);

test.each(['prerequisites', 'corequisites'] as const)(
    '%s mostra todos sem currículo identificado',
    (field) => {
        const markup = renderDetails({ [field]: requirements, [`curriculum_${field}`]: null });
        expect(markup).toContain('Nome atual');
        expect(markup).toContain('Nome antigo');
        expect(markup).toContain('2 matérias');
        expect(markup).toContain('Uma alternativa completa é suficiente.');
    }
);

test.each(['prerequisites', 'corequisites'] as const)(
    '%s informa quando não existe alternativa completa no currículo nem com turmas',
    (field) => {
        const markup = renderDetails({ [field]: requirements, [`curriculum_${field}`]: [] });
        expect(markup).toContain(
            'Nenhuma alternativa completa no currículo ou com turmas no semestre consultado.'
        );
        expect(markup).not.toContain('Nome antigo');
        expect(markup).not.toContain('Nome atual');
    }
);

test('não agrupa códigos com nomes iguais e preserva combinações completas', () => {
    const markup = renderToStaticMarkup(
        <RequirementList
            requirements={[
                [{ code: 'A', subject: { code: 'A', name: 'Mesmo nome' } }, { code: 'C' }],
                [{ code: 'B', subject: { code: 'B', name: 'Mesmo nome' } }]
            ]}
        />
    );
    expect(markup.match(/Mesmo nome/g)).toHaveLength(2);
    expect(markup).toContain('Alternativa 1 · Todas as disciplinas deste grupo');
    expect(markup).toContain('Alternativa 2');
    expect(markup).not.toContain('Códigos aceitos:');
});

test('equivalências exibem apenas a seleção com oferta informada pela API', () => {
    const markup = renderDetails({
        prerequisites: requirements,
        curriculum_prerequisites: [],
        equivalences: requirements,
        offered_equivalences: [requirements[1]]
    });
    expect(markup).toContain('Equivalências');
    expect(markup).not.toContain('Nome antigo');
    expect(markup).toContain('Nome atual');
});

test('oculta a seção de equivalências quando nenhuma alternativa tem turmas', () => {
    const markup = renderDetails({ equivalences: requirements, offered_equivalences: [] });
    expect(markup).not.toContain('Equivalências');
    expect(markup).not.toContain('Nome antigo');
    expect(markup).not.toContain('Nome atual');
});
