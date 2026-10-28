import { afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { CatalogSubject, SubjectClassroom } from '#/queries/subjects';

let AddToSchedule: typeof import('#/components/search/SchedulePlanner').AddToSchedule;
let SchedulePlanner: typeof import('#/components/search/SchedulePlanner').SchedulePlanner;
let SchedulePreview: typeof import('#/components/search/SchedulePlanner').SchedulePreview;

import { useDom } from '../../helpers/dom';

const dom = useDom();
beforeAll(async () => {
    ({ AddToSchedule, SchedulePlanner, SchedulePreview } =
        await import('#/components/search/SchedulePlanner'));
});
afterEach(() => dom.testing.cleanup());

const classroom: SubjectClassroom = {
    number: '01',
    semester: '2026.2',
    schedule: '35T23',
    room: null,
    professors: [],
    vacancies: 30,
    occupied: 10
};
const subject: CatalogSubject = {
    code: 'FGA0108',
    name: 'Matemática Discreta 2',
    hours: 60,
    unit: { id: 673, code: 'FCTE', name: 'CAMPUS UNB GAMA' },
    classrooms: [classroom]
};

function setup(alternative: Partial<SubjectClassroom> = {}) {
    return dom.testing.render(
        <SchedulePlanner>
            <SchedulePreview />
            <AddToSchedule subject={subject} classroom={classroom} />
            <AddToSchedule
                subject={{ ...subject, code: 'FGA0001' }}
                classroom={{ ...classroom, ...alternative }}
            />
        </SchedulePlanner>
    );
}

describe('montagem da grade semanal', () => {
    test.each(['24M12', null])(
        'bloqueia outra turma da mesma matéria mesmo sem conflito de horário: %s',
        (schedule) => {
            const { fireEvent } = dom.testing;
            const view = dom.testing.render(
                <SchedulePlanner>
                    <AddToSchedule subject={subject} classroom={classroom} />
                    <AddToSchedule
                        subject={subject}
                        classroom={{ ...classroom, number: '02', schedule }}
                    />
                </SchedulePlanner>
            );
            fireEvent.click(
                view.getByRole('button', { name: 'Adicionar à grade: FGA0108, turma 01' })
            );
            fireEvent.click(
                view.getByRole('button', { name: 'Adicionar à grade: FGA0108, turma 02' })
            );
            expect(view.getByRole('alert').textContent).toContain(
                'Matemática Discreta 2 já está na grade com a turma 01'
            );
            expect(
                view
                    .getByRole('button', { name: 'Adicionar à grade: FGA0108, turma 02' })
                    .getAttribute('aria-pressed')
            ).toBe('false');
            fireEvent.click(
                view.getByRole('button', { name: 'Remover da grade: FGA0108, turma 01' })
            );
            fireEvent.click(
                view.getByRole('button', { name: 'Adicionar à grade: FGA0108, turma 02' })
            );
            expect(
                view
                    .getByRole('button', { name: 'Remover da grade: FGA0108, turma 02' })
                    .getAttribute('aria-pressed')
            ).toBe('true');
        }
    );

    test('semestres distintos não geram choques entre si', async () => {
        const { fireEvent } = dom.testing;
        const view = setup({ semester: '2027.1' });
        for (const code of ['FGA0108', 'FGA0001']) {
            fireEvent.click(
                view.getByRole('button', { name: `Adicionar à grade: ${code}, turma 01` })
            );
        }
        fireEvent.click(view.getByRole('button', { name: 'Mostrar grade' }));
        await view.findByRole('dialog', { name: 'Minha grade semanal' });
        expect(view.getAllByRole('table')).toHaveLength(2);
        expect(view.queryByText('Choque de horário')).toBeNull();
    });

    test('abre um diálogo mais largo que o de matérias e permite remover', async () => {
        const { fireEvent } = dom.testing;
        const view = setup();
        expect(view.queryByText('Minha grade semanal')).toBeNull();
        fireEvent.click(view.getByRole('button', { name: 'Adicionar à grade: FGA0108, turma 01' }));
        expect(view.queryByText('Minha grade semanal')).toBeNull();
        fireEvent.click(view.getByRole('button', { name: 'Mostrar grade' }));
        await view.findByRole('dialog', { name: 'Minha grade semanal' });
        expect(view.getByRole('dialog', { name: 'Minha grade semanal' }).className).toContain(
            'sm:max-w-3xl'
        );
        const table = view.getByRole('table');
        expect(view.getByRole('button', { name: 'Baixar PNG' }).hasAttribute('disabled')).toBe(
            false
        );
        expect(table.textContent).toContain('14:00–14:55');
        expect(table.textContent).toContain('14:55–15:50');
        const row = dom.testing.within(table).getAllByRole('row')[1];
        const cells = dom.testing.within(row).getAllByRole('cell');
        expect(cells[1].textContent).toContain('FGA0108');
        expect(cells[3].textContent).toContain('FGA0108');
        expect(cells[0].textContent).toBe('—');
        fireEvent.click(
            view.getAllByRole('button', { name: 'Remover da grade: FGA0108, turma 01' })[0]
        );
        expect(view.queryByRole('table')).toBeNull();
        expect(view.getByRole('button', { name: 'Baixar PNG' }).hasAttribute('disabled')).toBe(
            true
        );
        expect(
            view.getByText('Adicione turmas nos resultados da busca para montar sua grade.')
        ).toBeTruthy();
    });

    test('bloqueia sobreposição parcial e identifica a turma em conflito antes de adicionar', async () => {
        const { fireEvent } = dom.testing;
        const view = setup({ schedule: '3T3' });
        fireEvent.click(view.getByRole('button', { name: 'Adicionar à grade: FGA0108, turma 01' }));
        fireEvent.click(view.getByRole('button', { name: 'Adicionar à grade: FGA0001, turma 01' }));
        expect(view.getByRole('alert').textContent).toContain(
            'em conflito com Matemática Discreta 2 · Turma 01'
        );
        expect(view.getByRole('alert').textContent).not.toMatch(/FGA0108|FGA0001/);
        expect(
            view
                .getByRole('button', { name: 'Adicionar à grade: FGA0001, turma 01' })
                .getAttribute('aria-pressed')
        ).toBe('false');
        fireEvent.click(view.getByRole('button', { name: 'Mostrar grade' }));
        await view.findByRole('dialog', { name: 'Minha grade semanal' });
        expect(view.getByRole('table').textContent).not.toContain('FGA0001');
    });

    test('aviso flutuante desaparece após dois segundos sem alterar a seleção', async () => {
        const { fireEvent, act } = dom.testing;
        const view = setup();
        fireEvent.click(view.getByRole('button', { name: 'Adicionar à grade: FGA0108, turma 01' }));
        fireEvent.click(view.getByRole('button', { name: 'Adicionar à grade: FGA0001, turma 01' }));
        expect(view.getByRole('alert').className).toContain('fixed');
        await act(() => new Promise((resolve) => setTimeout(resolve, 2100)));
        expect(view.queryByRole('alert')).toBeNull();
        expect(
            view
                .getByRole('button', { name: 'Adicionar à grade: FGA0001, turma 01' })
                .getAttribute('aria-pressed')
        ).toBe('false');
        expect(
            view
                .getByRole('button', { name: 'Remover da grade: FGA0108, turma 01' })
                .getAttribute('aria-pressed')
        ).toBe('true');
    });

    test('permite adicionar a turma após remover o conflito', () => {
        const { fireEvent } = dom.testing;
        const view = setup();
        fireEvent.click(view.getByRole('button', { name: 'Adicionar à grade: FGA0108, turma 01' }));
        fireEvent.click(view.getByRole('button', { name: 'Adicionar à grade: FGA0001, turma 01' }));
        expect(view.getByRole('alert')).toBeTruthy();
        fireEvent.click(view.getByRole('button', { name: 'Remover da grade: FGA0108, turma 01' }));
        expect(view.queryByRole('alert')).toBeNull();
        fireEvent.click(view.getByRole('button', { name: 'Adicionar à grade: FGA0001, turma 01' }));
        expect(
            view
                .getByRole('button', { name: 'Remover da grade: FGA0001, turma 01' })
                .getAttribute('aria-pressed')
        ).toBe('true');
    });

    test('fechar e reabrir mantém seleção', async () => {
        const { fireEvent } = dom.testing;
        const view = setup({ schedule: '35T4' });
        for (const code of ['FGA0108', 'FGA0001'])
            fireEvent.click(
                view.getByRole('button', { name: `Adicionar à grade: ${code}, turma 01` })
            );
        const trigger = view.getByRole('button', { name: 'Mostrar grade' });
        fireEvent.click(trigger);
        await view.findByRole('dialog', { name: 'Minha grade semanal' });
        expect(view.getByRole('table').textContent).toContain('FGA0001');
        fireEvent.click(view.getByRole('button', { name: 'Fechar grade semanal' }));
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(trigger);
        await view.findByRole('dialog', { name: 'Minha grade semanal' });
        expect(view.getByRole('table').textContent).toContain('FGA0001');
    });

    test('horários adjacentes não conflitam e a grade exibe segunda a sábado', async () => {
        const { fireEvent } = dom.testing;
        const view = setup({ schedule: '35T4 17N1' });
        for (const code of ['FGA0108', 'FGA0001'])
            fireEvent.click(
                view.getByRole('button', { name: `Adicionar à grade: ${code}, turma 01` })
            );
        fireEvent.click(view.getByRole('button', { name: 'Mostrar grade' }));
        await view.findByRole('dialog', { name: 'Minha grade semanal' });
        expect(view.queryByText('Choque de horário')).toBeNull();
        const rows = dom.testing.within(view.getByRole('table')).getAllByRole('row');
        const cells = dom.testing.within(rows.at(-1)!).getAllByRole('cell');
        expect(cells).toHaveLength(6);
        expect(cells[0].textContent).toBe('—');
        expect(cells[5].textContent).toContain('FGA0001');
        expect(view.queryByRole('columnheader', { name: 'Dom' })).toBeNull();
    });

    test('turma sem horário fica na lista e semestres diferentes têm tabelas separadas', async () => {
        const { fireEvent } = dom.testing;
        const view = setup({ semester: '2027.1', schedule: null });
        for (const code of ['FGA0108', 'FGA0001'])
            fireEvent.click(
                view.getByRole('button', { name: `Adicionar à grade: ${code}, turma 01` })
            );
        fireEvent.click(view.getByRole('button', { name: 'Mostrar grade' }));
        await view.findByRole('dialog', { name: 'Minha grade semanal' });
        expect(view.getByText('FGA0001 · T01: horário a definir.')).toBeTruthy();
        expect(view.getByRole('heading', { name: 'Semestre 2027.1' })).toBeTruthy();
        expect(view.getAllByRole('table')).toHaveLength(1);
        expect(view.queryByText('Choque de horário')).toBeNull();
    });
});
