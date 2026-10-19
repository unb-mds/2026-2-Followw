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
    prerequisites: [[{ code: 'FGA0001' }, { code: 'FGA0002' }], [{ code: 'FGA0010' }]],
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
    test.each(['prerequisites', 'corequisites', 'equivalences'] as const)(
        '%s usa o nome do catálogo e o código quando a matéria falta',
        (field) => {
            const markup = details({}, true, {
                [field]: [
                    [
                        { code: 'MAT0023', subject: { code: 'MAT0023', name: 'Cálculo 1' } },
                        { code: 'ANTIGO', subject: null }
                    ]
                ]
            });
            expect(markup).toContain('Cálculo 1');
            expect(markup).toContain('ANTIGO');
            expect(markup).toContain('href="/buscar?q=C%C3%A1lculo+1"');
        }
    );

    test('cada docente abre busca pelo próprio nome completo sem filtros', () => {
        const markup = details();
        expect(markup).toContain('href="/buscar?q=Ana+Silva"');
        expect(markup).toContain('href="/buscar?q=Jo%C3%A3o+Costa"');
        expect(markup).not.toContain('q=Ana+Silva%2C');
        expect(markup).toContain('hover:text-primary');
        expect(details({ professors: [] })).not.toContain('href="/buscar?q=Ana+Silva"');
    });

    test('busca por docente preserva o nome completo', () => {
        const professor = 'JOHN LENON CARDOSO GARDENGHI';
        const markup = details({ professors: [professor] });
        expect(markup).toContain(professor);
        expect(markup).toContain(`href="/buscar?${new URLSearchParams({ q: professor })}"`);
    });

    test('organiza os dados da turma e os requisitos da matéria', () => {
        const markup = details();
        for (const text of [
            'Ter, Qui · 14:00–15:50',
            'FCTE',
            'Ana Silva',
            'João Costa',
            '60 horas',
            'Pré-requisitos',
            'FGA0001',
            'FGA0002',
            'FGA0010',
            '38/40'
        ])
            expect(markup).toContain(text);
        expect(markup).not.toContain('Correquisitos');
        expect(markup).not.toContain('Turma indisponível');
    });

    test('vários requisitos ficam numa lista expansível com alternativas completas', () => {
        const markup = details();
        expect(markup).toContain('<details');
        expect(markup).toContain('<summary');
        expect(markup).toContain('3 matérias');
        expect(markup).toContain('Uma alternativa completa é suficiente.');
        expect(markup).toContain('Alternativa 1 · Todas as disciplinas deste grupo');
        expect(markup).toContain('Alternativa 2');
        expect(markup.match(/<li\b/g)).toHaveLength(3);
        expect(markup).not.toMatch(/<details[^>]*\bopen=/);
    });

    test('grupo único informa que todas as disciplinas são exigidas', () => {
        const markup = details({}, true, {
            prerequisites: [[{ code: 'FGA0001' }, { code: 'FGA0002' }]]
        });
        expect(markup).toContain('2 matérias');
        expect(markup).toContain('Todas as disciplinas abaixo são necessárias.');
        expect(markup.match(/<li\b/g)).toHaveLength(2);
        expect(markup).not.toContain('Alternativa 1');
    });

    test('um requisito simples exibe o nome diretamente sem expansão', () => {
        const name = 'INTRODUÇÃO ÀS CIÊNCIAS DA COMPUTAÇÃO E À ENGENHARIA DE SOFTWARE';
        const markup = details({}, true, {
            prerequisites: [[{ code: 'CIC0001', subject: { code: 'CIC0001', name } }]]
        });
        expect(markup).toContain(name);
        expect(markup).toContain(`href="/buscar?${new URLSearchParams({ q: name })}"`);
        expect(markup).not.toContain('1 matéria');
        expect(markup).not.toContain('<details');
        expect(markup).not.toContain('<summary');
    });

    test('desbloqueia aparece abaixo de pré-requisitos com nomes de dependentes', () => {
        const markup = details({}, true, {
            unlocks: [{ code: 'FGA0999', name: 'Disciplina seguinte' }]
        });
        expect(markup).toContain('Desbloqueia');
        expect(markup).toContain('Outros requisitos também podem ser necessários.');
        expect(markup).not.toContain('Disciplinas que têm esta matéria');
        expect(markup).not.toContain('1 matéria');
        expect(markup).toContain('Disciplina seguinte');
        expect(markup.indexOf('Pré-requisitos')).toBeLessThan(markup.indexOf('Desbloqueia'));
        expect(details()).not.toContain('Desbloqueia');
    });

    test.each([1, 2])(
        'desbloqueia com %s disciplinas expande apenas quando há mais de uma',
        (count) => {
            const markup = details({}, true, {
                prerequisites: null,
                unlocks: Array.from({ length: count }, (_, index) => ({
                    code: `DEP${index}`,
                    name: `Dependente ${index}`
                }))
            });
            expect(markup).toContain('Dependente 0');
            expect(markup).toContain('href="/buscar?q=Dependente+0"');
            if (count === 1) {
                expect(markup).not.toContain('<details');
                expect(markup).not.toContain('<summary');
            } else {
                expect(markup).toContain('<details');
                expect(markup).toContain('2 matérias');
                expect(markup).not.toMatch(/<details[^>]*\bopen=/);
            }
        }
    );

    test('equivalências aparecem antes de desbloqueia quando existem', () => {
        const markup = details({}, true, {
            equivalences: [[{ code: 'FGA0004' }]],
            unlocks: [{ code: 'FGA0999', name: 'Disciplina seguinte' }]
        });
        expect(markup.indexOf('Equivalências')).toBeGreaterThan(markup.indexOf('Pré-requisitos'));
        expect(markup.indexOf('Equivalências')).toBeLessThan(markup.indexOf('Desbloqueia'));
    });

    test('listas de matérias pesquisam pelo nome quando disponível', () => {
        const markup = details({}, true, {
            prerequisites: [[{ code: 'PRE', subject: { code: 'PRE', name: 'Pré-requisito' } }]],
            corequisites: [[{ code: 'COR' }]],
            equivalences: [[{ code: 'EQU' }]],
            unlocks: [{ code: 'DEP', name: 'Dependente' }]
        });
        for (const query of ['Pré-requisito', 'COR', 'EQU', 'Dependente']) {
            expect(markup).toContain(`href="/buscar?${new URLSearchParams({ q: query })}"`);
        }
        expect(markup).toContain('hover:text-primary');
        expect(markup).not.toContain('href="/buscar?q=PRE"');
        expect(markup).not.toContain('href="/buscar?q=DEP"');
        expect(markup).not.toContain('disponibilidade=');
        expect(markup).not.toContain('turno=');
    });

    test.each([{ vacancies: null }, { occupied: null }])('não inventa ocupação: %p', (missing) => {
        const markup = details(missing);
        expect(markup).toContain('Não informadas');
        expect(markup).not.toContain('text-destructive');
        expect(markup).not.toContain('text-warning');
    });

    test.each([
        [0, 100, 'text-primary'],
        [49, 100, 'text-primary'],
        [499, 1000, 'text-primary'],
        [50, 100, 'text-primary'],
        [60, 100, 'text-primary'],
        [24, 40, 'text-primary'],
        [601, 1000, 'text-warning'],
        [61, 100, 'text-warning'],
        [89, 100, 'text-warning'],
        [899, 1000, 'text-warning'],
        [90, 100, 'text-warning'],
        [37, 40, 'text-warning'],
        [999, 1000, 'text-warning'],
        [40, 40, 'text-destructive'],
        [42, 40, 'text-destructive']
    ])('ocupação %s de %s colore as vagas com %s', (occupied, vacancies, color) => {
        expect(details({ occupied, vacancies })).toContain(`class="tabular-nums ${color}"`);
    });

    test('capacidade zero não inventa percentual de ocupação', () => {
        expect(details({ occupied: 0, vacancies: 0 })).toContain('class="tabular-nums"');
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
            'Não informadas',
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
        expect(markup).toContain('2 resultados');
        expect(markup.match(/data-slot="accordion-item"/g)).toHaveLength(2);
        expect(markup).toContain('1 turma<');
        expect(markup).toContain('2 turmas');
        expect(markup).toContain('aria-expanded="false"');
    });

    test('exibe o tipo da matéria só quando informado', () => {
        const markup = renderToStaticMarkup(
            <TurmaSection
                title="Resultados"
                subjects={[
                    { ...subject, kind: 'optional' },
                    { ...subject, code: 'FGA0002', kind: 'free' },
                    { ...subject, code: 'FGA0003' }
                ]}
                approved={null}
            />
        );
        expect(markup).toContain('Optativa');
        expect(markup).toContain('Módulo livre');
        expect(markup).not.toContain('Obrigatória');
        expect(markup.match(/group\/badge/g)).toHaveLength(2);
    });

    test('seção vazia não é exibida', () => {
        expect(
            renderToStaticMarkup(<TurmaSection title="Vazio" subjects={[]} approved={null} />)
        ).toBe('');
    });
});
