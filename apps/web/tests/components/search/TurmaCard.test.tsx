import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { CatalogSubject, SubjectClassroom } from '#/queries/subjects';

import { TurmaCard } from '#/components/search/TurmaCard';
import { TurmaDetails } from '#/components/search/TurmaDetails';
import { TurmaSection } from '#/components/search/TurmaSection';

const classroom: SubjectClassroom = {
    number: '01',
    semester: '2026.2',
    schedule: '35T23',
    room: 'S3',
    professors: ['Ana Silva', 'João Costa'],
    vacancies: 40,
    occupied: 38
};

const subject: CatalogSubject = {
    code: 'FGA0108',
    name: 'Matemática Discreta 2',
    hours: 60,
    unity: 'FCTE',
    prerequisites: [['FGA0001', 'FGA0002'], ['FGA0010']],
    classrooms: [classroom]
};

const card = (turma: Partial<SubjectClassroom> = {}, met: boolean | null = true) =>
    renderToStaticMarkup(
        <TurmaCard
            subject={subject}
            classroom={{ ...classroom, ...turma }}
            prerequisitesMet={met}
        />
    );

const details = (
    turma: Partial<SubjectClassroom> = {},
    met: boolean | null = true,
    materia: Partial<CatalogSubject> = {}
) =>
    renderToStaticMarkup(
        <TurmaDetails
            subject={{ ...subject, ...materia }}
            classroom={{ ...classroom, ...turma }}
            prerequisitesMet={met}
        />
    );

describe('TurmaCard', () => {
    test('resumo abre os detalhes sem ocultar turmas bloqueadas', () => {
        for (const occupied of [38, 40]) {
            const markup = card({ occupied });
            expect(markup).toContain('Matemática Discreta 2');
            expect(markup).toContain('FGA0108 · T01');
            expect(markup).toContain('Ter, Qui · 14:00–15:50');
            expect(markup).toContain('S3 · Ana Silva, João Costa');
            expect(markup).toContain('aria-haspopup="dialog"');
            expect(markup).not.toContain('disabled=""');
        }
    });

    test('omite docentes ausentes e mantém aviso de local', () => {
        expect(card({ professors: [] })).toContain('>S3</span>');
        expect(card({ room: null })).toContain('Local não informado · Ana Silva, João Costa');
        expect(card({ schedule: null })).toContain('Horário a definir');
    });

    test('cadeado informa lotação e pré-requisito', () => {
        expect(card({}, false)).toContain('aria-label="Pré-requisitos não atendidos"');
        expect(card({ occupied: 40 }, false)).toContain(
            'aria-label="Turma cheia. Pré-requisitos não atendidos"'
        );
    });

    test.each([true, null])('turma com vagas não tem cadeado quando requisito é %s', (met) => {
        expect(card({}, met)).not.toContain('lucide-lock');
    });
});

describe('TurmaDetails', () => {
    test('organiza os dados da turma e os requisitos da matéria', () => {
        const markup = details();
        for (const text of [
            'Ter, Qui · 14:00–15:50',
            'FCTE',
            'Ana Silva, João Costa',
            '60 horas',
            'Pré-requisitos',
            '(FGA0001 e FGA0002) ou FGA0010',
            '38 de 40 vagas ocupadas',
            '2 vagas disponíveis'
        ])
            expect(markup).toContain(text);
        expect(markup).not.toContain('Correquisitos');
        expect(markup).not.toContain('Turma indisponível');
    });

    test.each([
        [38, 40, 95],
        [42, 40, 100],
        [0, 0, 0]
    ])('barra de %s/%s não ultrapassa o total', (occupied, vacancies, percent) => {
        const markup = details({ occupied, vacancies });
        expect(markup).toContain(`aria-valuenow="${percent}"`);
        expect(markup).not.toContain('NaN');
    });

    test.each([{ vacancies: null }, { occupied: null }])('não inventa ocupação: %p', (missing) => {
        const markup = details(missing);
        expect(markup).toContain('Vagas não informadas');
        expect(markup).not.toContain('role="progressbar"');
    });

    test('indica uma única vaga no singular', () => {
        expect(details({ occupied: 39 })).toContain('1 vaga disponível');
    });

    test('mostra os impedimentos da turma', () => {
        expect(details({ occupied: 40 }, false)).toContain(
            'Turma cheia · Pré-requisitos não atendidos'
        );
        expect(details({ occupied: 40 }, null)).not.toContain('Pré-requisitos não atendidos');
    });

    test('dados ausentes usam textos padrão', () => {
        const markup = details(
            { vacancies: null, occupied: null, schedule: null, room: null, professors: [] },
            true,
            { unity: null, hours: null, prerequisites: null }
        );
        for (const text of [
            'Vagas não informadas',
            'Horário a definir',
            'Local não informado',
            'Unidade não informada',
            'Docentes não informados',
            'Não informada'
        ])
            expect(markup).toContain(text);
        expect(markup).not.toContain('Pré-requisitos');
    });
});

describe('TurmaSection', () => {
    test('um accordion recolhido por matéria', () => {
        const other = { ...subject, code: 'FGA0002', classrooms: [classroom, classroom] };
        const markup = renderToStaticMarkup(
            <TurmaSection title="Resultados" subjects={[subject, other]} approved={null} />
        );
        expect(markup).toContain('Resultados');
        expect(markup.match(/data-slot="accordion-item"/g)).toHaveLength(2);
        expect(markup).toContain('1 turma<');
        expect(markup).toContain('2 turmas');
        expect(markup).toContain('aria-expanded="false"');
    });

    test('seção vazia não é exibida', () => {
        expect(
            renderToStaticMarkup(<TurmaSection title="Vazio" subjects={[]} approved={null} />)
        ).toBe('');
    });
});
