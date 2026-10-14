import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { TurmaBusca } from '#/queries/search-classrooms';

import { TurmaCard } from '#/components/search/TurmaCard';
import { TurmaDetails } from '#/components/search/TurmaDetails';
import { TurmaSection } from '#/components/search/TurmaSection';

const turma: TurmaBusca = {
    id: '1',
    subject: { code: 'FGA0108', name: 'Matemática Discreta 2', unity: 'FCTE' },
    number: '01',
    semester: '2026.2',
    schedule: '35T23',
    room: 'S3',
    prerequisites: null,
    professors: ['Ana Silva', 'João Costa'],
    vacancies: 40,
    occupied: 38
};

describe('TurmaCard', () => {
    test('resumo compacto abre detalhes sem exigir matrícula ou ocultar turmas bloqueadas', () => {
        for (const occupied of [38, 40]) {
            const markup = renderToStaticMarkup(<TurmaCard turma={{ ...turma, occupied }} />);
            expect(markup).toContain('Matemática Discreta 2');
            expect(markup).toContain('FGA0108 · T01');
            expect(markup).toContain('Ter, Qui · 14:00–15:50');
            expect(markup).toContain('S3');
            expect(markup).toContain('aria-haspopup="dialog"');
            expect(markup).toContain('aria-expanded="false"');
            expect(markup).not.toContain('disabled=""');
            expect(markup).toContain('S3 · Ana Silva, João Costa');
            expect(markup).not.toContain('Vagas na coleta');
        }
    });

    test('turmas no card da matéria não têm contorno próprio e mantêm acesso aos detalhes', () => {
        const markup = renderToStaticMarkup(<TurmaCard turma={turma} />);
        expect(markup).toContain('shadow-none');
        expect(markup).toContain('ring-0');
        expect(markup).toContain('bg-transparent');
        expect(markup).toContain('aria-haspopup="dialog"');
        expect(markup).toContain('S3 · Ana Silva, João Costa');
    });

    test('omite o nome do professor quando a turma não tem docente informado', () => {
        const markup = renderToStaticMarkup(<TurmaCard turma={{ ...turma, professors: [] }} />);
        expect(markup).toContain('>S3</span>');
        expect(markup).not.toContain('S3 ·');
        expect(markup).not.toContain('Ana Silva');
    });

    test('mantém o professor ao lado do aviso quando a sala não está informada', () => {
        const markup = renderToStaticMarkup(<TurmaCard turma={{ ...turma, room: null }} />);
        expect(markup).toContain('Local não informado · Ana Silva, João Costa');
    });

    test('avaliação pessoal preserva o cadeado por pré-requisito mesmo com vagas', () => {
        const markup = renderToStaticMarkup(
            <TurmaCard turma={{ ...turma, prerequisites: 'MAT0001', prerequisites_met: false }} />
        );
        expect(markup).toContain('aria-label="Pré-requisitos não atendidos"');
        expect(markup).not.toContain('MAT0001');
    });

    test('cadeado informa lotação e pré-requisito quando ambos impedem matrícula', () => {
        const markup = renderToStaticMarkup(
            <TurmaCard
                turma={{ ...turma, occupied: 40, prerequisites: 'MAT0001' }}
                prerequisitesMet={false}
            />
        );
        expect(markup).toContain('aria-label="Turma cheia. Pré-requisitos não atendidos"');
    });

    test.each([true, null])('turma com vagas não recebe cadeado quando requisito é %s', (met) => {
        const markup = renderToStaticMarkup(
            <TurmaCard turma={{ ...turma, prerequisites: 'MAT0001' }} prerequisitesMet={met} />
        );
        expect(markup).not.toContain('lucide-lock');
        expect(markup).not.toContain('Pré-requisitos');
    });

    test('horário e local ausentes usam os mesmos textos de Minhas turmas', () => {
        const markup = renderToStaticMarkup(
            <TurmaCard turma={{ ...turma, schedule: null, room: null }} />
        );
        expect(markup).toContain('Horário a definir');
        expect(markup).toContain('Local não informado');
    });
});

describe('TurmaDetails', () => {
    test('organiza dados reais da turma sem informações pessoais de matrícula', () => {
        const markup = renderToStaticMarkup(
            <TurmaDetails turma={{ ...turma, subject: { ...turma.subject, hours: 60 } }} />
        );
        for (const text of [
            'Horário',
            'Ter, Qui · 14:00–15:50',
            'Local',
            'S3',
            'Unidade',
            'FCTE',
            'Docentes',
            'Ana Silva, João Costa',
            'Carga horária',
            '60 horas',
            'Vagas',
            '38 de 40 vagas ocupadas',
            '2 vagas disponíveis'
        ])
            expect(markup).toContain(text);
        expect(markup).not.toContain('Turma indisponível');
    });

    test.each([
        [0, 40, 0],
        [38, 40, 95],
        [40, 40, 100],
        [42, 40, 100],
        [0, 0, 0]
    ])(
        'barra representa a ocupação de %s/%s sem ultrapassar o total',
        (occupied, vacancies, percent) => {
            const markup = renderToStaticMarkup(
                <TurmaDetails turma={{ ...turma, occupied, vacancies }} />
            );
            expect(markup).toContain('role="progressbar"');
            expect(markup).toContain('aria-label="Ocupação da turma"');
            expect(markup).toContain(`aria-valuenow="${percent}"`);
            expect(markup).toContain(`aria-valuetext="${occupied} de ${vacancies} vagas ocupadas"`);
            expect(markup).toContain('>Vagas</dt>');
            expect(markup).not.toContain('na coleta');
            expect(markup).not.toContain('NaN');
        }
    );

    test.each([{ vacancies: null }, { occupied: null }])(
        'não apresenta uma ocupação inventada quando falta um dado: %p',
        (missing) => {
            const markup = renderToStaticMarkup(<TurmaDetails turma={{ ...turma, ...missing }} />);
            expect(markup).toContain('Vagas não informadas');
            expect(markup).not.toContain('role="progressbar"');
        }
    );

    test('indica uma única vaga disponível no singular', () => {
        const markup = renderToStaticMarkup(<TurmaDetails turma={{ ...turma, occupied: 39 }} />);
        expect(markup).toContain('1 vaga disponível');
    });

    test.each([true, null])('oculta requisitos nas turmas disponíveis, estado %s', (met) => {
        const markup = renderToStaticMarkup(
            <TurmaDetails turma={{ ...turma, prerequisites: 'MAT0001' }} prerequisitesMet={met} />
        );
        expect(markup).not.toContain('Pré-requisitos');
        expect(markup).not.toContain('MAT0001');
    });

    test('mostra motivo e expressão somente ao consultar turma com pré-requisito pendente', () => {
        const markup = renderToStaticMarkup(
            <TurmaDetails
                turma={{
                    ...turma,
                    prerequisites: '( MAT0001 E FGA0002 )',
                    prerequisites_met: false
                }}
            />
        );
        expect(markup).toContain('Turma indisponível');
        expect(markup).toContain('Pré-requisitos não atendidos');
        expect(markup).toContain('MAT0001 E FGA0002');
        expect(markup).not.toContain('Ainda não verificados');
    });

    test.each([true, null])(
        'turma cheia mostra apenas lotação quando requisitos não estão pendentes: %s',
        (met) => {
            const markup = renderToStaticMarkup(
                <TurmaDetails
                    turma={{
                        ...turma,
                        occupied: 40,
                        prerequisites: 'MAT0001',
                        prerequisites_met: met
                    }}
                />
            );
            expect(markup).toContain('Turma cheia');
            expect(markup).toContain('40 de 40 vagas ocupadas');
            expect(markup).toContain('0 vagas disponíveis');
            expect(markup).not.toContain('Pré-requisitos');
            expect(markup).not.toContain('MAT0001');
        }
    );

    test('mantém os dois impedimentos quando a turma está cheia e faltam pré-requisitos', () => {
        const markup = renderToStaticMarkup(
            <TurmaDetails
                turma={{
                    ...turma,
                    occupied: 40,
                    prerequisites: 'MAT0001',
                    prerequisites_met: false
                }}
            />
        );
        expect(markup).toContain('Turma cheia · Pré-requisitos não atendidos');
        expect(markup).toContain('Pré-requisitos: MAT0001');
    });

    test('não inventa vagas ou requisitos não verificados nas turmas cheias', () => {
        const unknown = renderToStaticMarkup(
            <TurmaDetails
                turma={{
                    ...turma,
                    vacancies: null,
                    occupied: null,
                    schedule: null,
                    room: null,
                    professors: [],
                    subject: { ...turma.subject, unity: null }
                }}
            />
        );
        for (const text of [
            'Vagas não informadas',
            'Horário a definir',
            'Local não informado',
            'Unidade não informada',
            'Docentes não informados',
            'Não informada'
        ])
            expect(unknown).toContain(text);
        expect(unknown).not.toContain('Turma indisponível');
        const full = renderToStaticMarkup(
            <TurmaDetails turma={{ ...turma, occupied: 40, prerequisites: 'MAT0001' }} />
        );
        expect(full).toContain('Turma cheia');
        expect(full).not.toContain('Ainda não verificados no histórico');
        expect(full).not.toContain('MAT0001');
        expect(full).not.toContain('Pré-requisitos não atendidos');
    });
});

describe('TurmaSection', () => {
    test('agrupa turmas da mesma matéria e inicia com os cards recolhidos', () => {
        const second = { ...turma, id: '2', number: '02', occupied: 40 };
        const third = { ...turma, id: '3', number: '03', prerequisites_met: false };
        const markup = renderToStaticMarkup(
            <TurmaSection title="Turmas do semestre" turmas={[turma, second, third]} />
        );
        expect(markup.match(/data-slot="accordion-item"/g)).toHaveLength(1);
        expect(markup).toContain('Matemática Discreta 2');
        expect(markup).toContain('FGA0108');
        expect(markup).toContain('3 turmas');
        expect(markup).toContain('aria-expanded="false"');
        expect(markup).not.toContain('data-slot="dialog-trigger"');
        expect(markup).not.toContain('Ter, Qui');
    });

    test('matérias com nomes iguais e códigos diferentes têm accordions próprios', () => {
        const anotherSubject = {
            ...turma,
            id: '2',
            subject: { ...turma.subject, code: 'FGA0002' }
        };
        const markup = renderToStaticMarkup(
            <TurmaSection title="Turmas" turmas={[turma, anotherSubject]} />
        );
        expect(markup.match(/data-slot="accordion-item"/g)).toHaveLength(2);
        expect(markup).toContain('FGA0108');
        expect(markup).toContain('FGA0002');
        expect(markup.match(/1 turma</g)).toHaveLength(2);
    });

    test('agrupa turmas não consecutivas sem descartar as indisponíveis', () => {
        const anotherSubject = {
            ...turma,
            id: '2',
            subject: { ...turma.subject, code: 'FGA0002' }
        };
        const full = { ...turma, id: '3', number: '03', occupied: 40 };
        const markup = renderToStaticMarkup(
            <TurmaSection title="Turmas" turmas={[turma, anotherSubject, full]} />
        );
        expect(markup.match(/data-slot="accordion-item"/g)).toHaveLength(2);
        expect(markup).toContain('2 turmas');
        expect(markup).toContain('1 turma');
    });

    test('renderiza título e matérias', () => {
        const markup = renderToStaticMarkup(
            <TurmaSection title="Turmas com vagas" turmas={[turma]} />
        );
        expect(markup).toContain('Turmas com vagas');
        expect(markup).toContain('Matemática Discreta 2');
    });

    test('seção vazia não é exibida', () => {
        expect(renderToStaticMarkup(<TurmaSection title="Vazio" turmas={[]} />)).toBe('');
    });
});
