import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ClassroomFrequency, Lesson } from '#/queries/classrooms';

import { FrequencyContent } from '#/components/classroom/FrequencyContent';

const progress = { taught: 30, total: 60, percentage: 50 };

const lesson = (occurred_on: string, fields: Partial<Lesson> = {}): Lesson => ({
    occurred_on,
    position: 0,
    status: 'nao_registrada',
    hours: 2,
    absences: 0,
    marked: false,
    ...fields
});

const registered: ClassroomFrequency = {
    progress,
    frequency_status: 'registrada',
    lessons: [
        lesson('2026-10-07', { status: 'falta', absences: 2 }),
        lesson('2026-10-06'),
        lesson('2026-10-05', { status: 'presente' })
    ],
    totals: { presences: 1, absences: 2, percentage: 93.3, max_absences: 11, estimated: false }
};

const notRegistered: ClassroomFrequency = {
    progress,
    frequency_status: 'nao_registrada',
    lessons: [],
    totals: null
};

const render = (data: ClassroomFrequency) =>
    renderToStaticMarkup(<FrequencyContent data={data} onMark={() => {}} pending={false} />);

const row = (item: Lesson) =>
    render({ ...notRegistered, lessons: [item] }).match(/<div class="flex flex-wrap[^"]*"/)![0];

const tone = (percentage: number) =>
    render({ ...registered, totals: { ...registered.totals!, percentage } }).match(
        /<dd class="([^"]*)">[\d,]+%</
    )?.[1];

describe('FrequencyContent', () => {
    test('mostra os totais de presenças, faltas e frequência', () => {
        const markup = render(registered);
        expect(markup).toMatch(/Presenças<\/dt><dd[^>]*>1</);
        expect(markup).toMatch(
            /Faltas<\/dt><dd[^>]*>2<small[^>]*text-foreground[^>]*> \/ 11<\/small>/
        );
        expect(markup).toMatch(/Frequência<\/dt><dd[^>]*>93,3%</);
        expect(markup).not.toContain('Frequência estimada');
    });

    test('colore a frequência: normal acima de 80%, amarelo até 80%, vermelho abaixo de 75%', () => {
        expect(tone(80.1)).not.toMatch(/text-(warning|destructive)/);
        expect(tone(80)).toContain('text-warning');
        expect(tone(75)).toContain('text-warning');
        expect(tone(74.9)).toContain('text-destructive');
    });

    test('lista as aulas na ordem da API, com o dia da semana', () => {
        const markup = render(registered);
        const order = ['07/10/2026', '06/10/2026', '05/10/2026'].map((date) =>
            markup.indexOf(date)
        );
        expect(order).toEqual(order.toSorted((a, b) => a - b));
        expect(markup).toContain('qua');
        expect(markup).toContain('2 faltas');
        expect(markup).toContain('Não registrada');
    });

    test('avisa quando o professor ainda não lançou a frequência', () => {
        const markup = render(notRegistered);
        expect(markup).toContain('ainda não foi lançada');
        expect(markup).not.toContain('Faltas');
    });

    test('o aviso de frequência não lançada vem depois da lista de aulas', () => {
        const markup = render({ ...notRegistered, lessons: [lesson('2026-10-05')] });
        expect(markup.indexOf('05/10/2026')).toBeLessThan(markup.indexOf('ainda não foi lançada'));
    });

    test('avisa quando só parte das aulas foi registrada', () => {
        const markup = render({ ...registered, frequency_status: 'parcialmente_registrada' });
        expect(markup).toContain('ainda não foi registrada');
    });

    test('identifica as marcações do aluno e a frequência estimada', () => {
        const markup = render({
            ...registered,
            lessons: [
                lesson('2026-10-08', { status: 'cancelada', marked: true }),
                lesson('2026-10-06', { status: 'falta', absences: 2, marked: true })
            ],
            totals: {
                presences: 1,
                absences: 4,
                percentage: 87.5,
                max_absences: null,
                estimated: true
            }
        });
        // a linha toda é riscada, só a cancelada
        expect(markup.match(/line-through/g)).toHaveLength(1);
        expect(markup).toMatch(/line-through.*Aula cancelada/);
        expect(markup).toContain('lucide-circle-slash');
        expect(markup).toContain('Marcada');
        expect(markup).toContain('Frequência estimada');
        expect(markup).not.toContain('<small');
    });

    test('presença e falta tingem a linha toda; as demais ficam neutras', () => {
        expect(row(lesson('2026-10-05', { status: 'presente' }))).toContain('text-primary');
        expect(row(lesson('2026-10-07', { status: 'falta', absences: 2 }))).toContain(
            'text-destructive'
        );
        expect(row(lesson('2026-10-06'))).not.toMatch(/text-(primary|destructive)/);
        expect(row(lesson('2026-10-08', { status: 'cancelada', marked: true }))).not.toMatch(
            /text-(primary|destructive)/
        );
    });

    test('só as aulas sem chamada do SIGAA têm a bolinha como menu', () => {
        const markup = render(registered);
        expect(markup.match(/<button/g)).toHaveLength(1);
        expect(markup).toContain(
            'Situação de 06/10/2026, aula 1: Não registrada. Alterar situação.'
        );
        expect(markup).toContain('after:-inset-2');
    });

    test('a bolinha abre o menu em vez de alternar a situação', () => {
        const markup = render({ ...notRegistered, lessons: [lesson('2026-10-06')] });
        expect(markup).toContain('aria-haspopup="menu"');
        expect(markup).not.toContain('title=');
    });

    test('desabilita as bolinhas enquanto salva', () => {
        const markup = renderToStaticMarkup(
            <FrequencyContent data={registered} onMark={() => {}} pending />
        );
        expect(markup).toContain('disabled');
    });

    test('distingue aulas diferentes na mesma data', () => {
        const markup = render({
            ...notRegistered,
            lessons: [lesson('2026-10-06', { position: 1 }), lesson('2026-10-06')]
        });
        expect(markup).toContain('Aula 1');
        expect(markup).toContain('Aula 2');
        expect(render(registered)).not.toContain('Aula 1');
    });
});
