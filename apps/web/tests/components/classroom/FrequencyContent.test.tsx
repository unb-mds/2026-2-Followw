import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { MarkLessons } from '#/components/classroom/FrequencyContent';
import type { ClassroomFrequency, Lesson } from '#/queries/classrooms';

import { FrequencyContent, lessonRuns } from '#/components/classroom/FrequencyContent';
import { nowInBrasilia } from '#/lib/schedule';

import { useDom } from '../../helpers/dom';

const progress = { taught: 30, total: 60, percentage: 50 };

const lesson = (occurred_on: string, fields: Partial<Lesson> = {}): Lesson => ({
    id: `${occurred_on}:${fields.start_time ?? ''}`,
    occurred_on,
    start_time: null,
    end_time: null,
    status: 'nao_registrada',
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
    test('mostra apenas "Hoje" e "Ontem" nas aulas desses dias', () => {
        const today = nowInBrasilia().date;
        const yesterday = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10);
        const markup = render({
            ...notRegistered,
            lessons: [lesson(today), lesson(yesterday), lesson('2020-10-05')]
        });
        expect(markup).toContain('<span>Hoje</span>');
        expect(markup).toContain('<span>Ontem</span>');
        expect(markup).not.toContain(`tabular-nums">${today.split('-').toReversed().join('/')}`);
        expect(markup).toContain('tabular-nums">05/10/2020');
    });

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
        expect(markup).toMatch(/text-destructive">Falta</);
        expect(markup).toContain('Não registrada');
    });

    test('avisa quando o professor ainda não lançou a frequência', () => {
        const markup = render(notRegistered);
        expect(markup).toContain('ainda não foi lançada');
        expect(markup).not.toContain('Faltas');
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

    test('aulas sem chamada viram checkbox e as marcadas mantêm o menu', () => {
        const markup = render({
            ...registered,
            lessons: [
                ...registered.lessons,
                lesson('2026-10-04', { status: 'falta', absences: 1, marked: true })
            ]
        });
        expect(markup.match(/role="checkbox"/g)).toHaveLength(1);
        expect(markup).toContain('aria-label="Selecionar aula de 06/10/2026"');
        expect(markup.match(/aria-haspopup="menu"/g)).toHaveLength(1);
        expect(markup).toContain('Situação de 04/10/2026, aula: Falta. Alterar situação.');
    });

    test('sem seleção não mostra a barra de marcação', () => {
        expect(render(registered)).not.toContain('role="toolbar"');
    });

    test('desabilita os checkboxes enquanto salva', () => {
        const markup = renderToStaticMarkup(
            <FrequencyContent data={registered} onMark={() => {}} pending />
        );
        expect(markup).toContain('disabled');
    });
});

describe('marcação das aulas', () => {
    const dom = useDom();
    afterEach(() => dom.testing.cleanup());

    const semChamada = [lesson('2026-10-08'), lesson('2026-10-06'), lesson('2026-10-01')];
    const data: ClassroomFrequency = { ...notRegistered, lessons: semChamada };

    function renderMarking(frequency = data) {
        const calls: Parameters<MarkLessons>[] = [];
        const page = dom.testing.render(
            <FrequencyContent
                data={frequency}
                onMark={(...args) => calls.push(args)}
                pending={false}
            />
        );
        return { page, calls };
    }

    test('seleciona aulas e marca todas de uma vez pela barra', () => {
        const { fireEvent } = dom.testing;
        const { page, calls } = renderMarking();

        fireEvent.click(page.getByRole('checkbox', { name: 'Selecionar aula de 08/10/2026' }));
        fireEvent.click(page.getByRole('checkbox', { name: 'Selecionar aula de 01/10/2026' }));
        const toolbar = page.getByRole('toolbar', { name: 'Marcar aulas selecionadas' });
        expect(toolbar.textContent).toContain('2 aulas');
        fireEvent.click(dom.testing.within(toolbar).getByRole('button', { name: 'Presença' }));

        expect(calls).toEqual([[[semChamada[0], semChamada[2]], 'presente']]);
        expect(page.queryByRole('toolbar')).toBeNull();
    });

    test('desmarcar e limpar a seleção escondem a barra sem marcar', () => {
        const { fireEvent } = dom.testing;
        const { page, calls } = renderMarking();
        const primeira = page.getByRole('checkbox', { name: 'Selecionar aula de 08/10/2026' });

        fireEvent.click(primeira);
        fireEvent.click(primeira);
        expect(page.queryByRole('toolbar')).toBeNull();

        fireEvent.click(primeira);
        fireEvent.click(page.getByRole('button', { name: 'Limpar seleção' }));

        expect(page.queryByRole('toolbar')).toBeNull();
        expect(calls).toEqual([]);
    });

    test('limpa todas as marcações de uma vez', () => {
        const marcadas = [
            { ...semChamada[0], status: 'presente', marked: true },
            { ...semChamada[1], status: 'falta', marked: true }
        ] satisfies Lesson[];
        const { page, calls } = renderMarking({
            ...data,
            lessons: [...marcadas, semChamada[2]]
        });

        dom.testing.fireEvent.click(page.getByRole('button', { name: 'Limpar marcações' }));

        expect(calls).toEqual([[marcadas, null]]);
    });

    test('sem marcações não mostra o botão de limpar', () => {
        const { page } = renderMarking();
        expect(page.queryByRole('button', { name: 'Limpar marcações' })).toBeNull();
    });

    test('aula que deixa de ser selecionável sai da seleção', () => {
        const { fireEvent } = dom.testing;
        const { page } = renderMarking();
        fireEvent.click(page.getByRole('checkbox', { name: 'Selecionar aula de 08/10/2026' }));
        fireEvent.click(page.getByRole('checkbox', { name: 'Selecionar aula de 06/10/2026' }));

        // a frequência relida volta com a de 08/10 já marcada
        page.rerender(
            <FrequencyContent
                data={{
                    ...data,
                    lessons: [
                        { ...semChamada[0], status: 'presente', marked: true },
                        ...semChamada.slice(1)
                    ]
                }}
                onMark={() => {}}
                pending={false}
            />
        );

        expect(page.getByRole('toolbar').textContent).toContain('1 aula');
    });

    test('agrupa as aulas em sequências cronológicas, sem as canceladas', () => {
        expect(
            lessonRuns([
                lesson('2026-10-09', { status: 'presente' }),
                lesson('2026-10-08', { status: 'falta' }),
                lesson('2026-10-07', { status: 'cancelada' }),
                lesson('2026-10-06', { status: 'falta' }),
                lesson('2026-10-05', { status: 'presente' }),
                lesson('2026-10-04', { status: 'presente' })
            ])
        ).toMatchObject([
            { status: 'presente', count: 2 },
            { status: 'falta', count: 2 },
            { status: 'presente', count: 1 }
        ]);
    });

    test('mostra o andamento das aulas segmentado junto dos totais', () => {
        const markup = render(registered);
        expect(markup).toMatch(/Frequência<\/dt>[\s\S]*Andamento das aulas/);
        expect(markup).toContain('role="progressbar"');
        expect(markup).toMatch(
            /bg-primary"[^>]*flex-grow:1[\s\S]*bg-muted-foreground\/40[\s\S]*bg-destructive/
        );
    });

    test('sem totais mostra apenas o andamento contínuo', () => {
        const markup = render(notRegistered);
        expect(markup).toContain('Andamento das aulas');
        expect(markup).toContain('data-slot="progress-indicator"');
        expect(markup).not.toContain('min-w-1 rounded-full');
    });
});
