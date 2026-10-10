import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { TurmaBusca } from '#/queries/search-classrooms';

import { TurmaCard } from '#/components/search/TurmaCard';
import { TurmaSection } from '#/components/search/TurmaSection';

const turmaDisponivel: TurmaBusca = {
    id: '1',
    codigo: 'FGA0108',
    turma: 'T01',
    nome: 'Matemática Discreta 2',
    horario: 'Ter · 16:00–17:50',
    local: 'FGA / Auditório',
    turno: 'Manhã',
    campus: 'Gama',
    semestre: '2027.2',
    disponivel: true
};

const turmaIndisponivel: TurmaBusca = {
    id: '2',
    codigo: 'FGA0099',
    turma: 'T02',
    nome: 'Probabilidade e Estatística',
    horario: 'Sex · 14:00–16:50',
    local: 'FGA / Sala 4',
    turno: 'Manhã',
    campus: 'Gama',
    semestre: '2027.2',
    disponivel: false
};

describe('TurmaCard', () => {
    test('renderiza informações da turma disponível', () => {
        const markup = renderToStaticMarkup(<TurmaCard turma={turmaDisponivel} />);
        expect(markup).toContain('Matemática Discreta 2');
        expect(markup).toContain('FGA0108 · T01');
        expect(markup).toContain('Ter · 16:00–17:50');
        expect(markup).toContain('FGA / Auditório');
        expect(markup).not.toContain('Turma indisponível');
    });

    test('exibe indicador de indisponibilidade quando turma não está disponível', () => {
        const markup = renderToStaticMarkup(<TurmaCard turma={turmaIndisponivel} />);
        expect(markup).toContain('Probabilidade e Estatística');
        expect(markup).toContain('Turma indisponível');
    });
});

describe('TurmaSection', () => {
    test('renderiza título e turmas da seção', () => {
        const markup = renderToStaticMarkup(
            <TurmaSection title="Turmas disponíveis" turmas={[turmaDisponivel]} />
        );
        expect(markup).toContain('Turmas disponíveis');
        expect(markup).toContain('Matemática Discreta 2');
    });

    test('não renderiza nada quando lista está vazia', () => {
        const markup = renderToStaticMarkup(<TurmaSection title="Vazio" turmas={[]} />);
        expect(markup).toBe('');
    });
});
