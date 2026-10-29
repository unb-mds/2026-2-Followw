import type { Middleware } from 'openapi-fetch';

import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import { useLayoutEffect } from 'react';

import type { CatalogSubject, SubjectClassroom } from '#/queries/subjects';

import { getContext } from '#/integrations/tanstack-query/root-provider';
import { localStorageRepository, STORAGE_KEYS } from '#/lib/local-storage';
import { clearSession, startSession } from '#/queries/auth';
import { apiClient } from '#/queries/client';
import { ApiError } from '#/queries/errors';

let AddToSchedule: typeof import('#/components/search/SchedulePlanner').AddToSchedule;
let SchedulePlanner: typeof import('#/components/search/SchedulePlanner').SchedulePlanner;
let SchedulePreview: typeof import('#/components/search/SchedulePlanner').SchedulePreview;

import { useDom } from '../../helpers/dom';

const dom = useDom();
let restoreLayoutEffect: () => Promise<void>;
beforeAll(async () => {
    const { useIsoLayoutEffect } = await import('@base-ui/utils/useIsoLayoutEffect');
    await mock.module('@base-ui/utils/useIsoLayoutEffect', () => ({
        useIsoLayoutEffect: useLayoutEffect
    }));
    restoreLayoutEffect = async () => {
        await mock.module('@base-ui/utils/useIsoLayoutEffect', () => ({ useIsoLayoutEffect }));
    };
    ({ AddToSchedule, SchedulePlanner, SchedulePreview } =
        await import('#/components/search/SchedulePlanner'));
});
afterAll(() => restoreLayoutEffect());
afterEach(() => {
    dom.testing.cleanup();
    localStorage.clear();
});

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

const button = (view: ReturnType<typeof setup>, name: string) => view.getByRole('button', { name });

describe('montagem da grade semanal', () => {
    test.each(['logout', 'login', 'sessão expirada'])(
        'limpa a grade salva e montada ao mudar a sessão (%s) sem herdar conflitos',
        async (change) => {
            const { fireEvent, act } = dom.testing;
            const { queryClient } = getContext();
            const view = setup();
            localStorageRepository.set(STORAGE_KEYS.THEME, 'dark');
            fireEvent.click(button(view, 'Adicionar à grade: FGA0108, turma 01'));
            expect(JSON.parse(localStorage.getItem('followw:schedule')!)).toHaveLength(1);
            const middleware: Middleware = {
                onRequest: () => Response.json({ registration: 'outra-conta' })
            };
            apiClient.use(middleware);
            try {
                await act(async () => {
                    if (change === 'login') await startSession(queryClient);
                    else if (change === 'logout') await clearSession(queryClient);
                    else {
                        await queryClient
                            .query({
                                queryKey: ['get', '/classrooms'],
                                queryFn: () => Promise.reject(new ApiError(401, 'expirada'))
                            })
                            .catch(() => {});
                    }
                });
            } finally {
                apiClient.eject(middleware);
                queryClient.clear();
            }
            expect(localStorage.getItem('followw:schedule')).toBeNull();
            expect(localStorageRepository.get(STORAGE_KEYS.THEME)).toBe('dark');
            expect(view.queryByRole('toolbar')).toBeNull();
            fireEvent.click(button(view, 'Adicionar à grade: FGA0001, turma 01'));
            expect(view.queryByText('Não foi possível adicionar à grade')).toBeNull();
            expect(button(view, 'Remover da grade: FGA0001, turma 01')).toBeTruthy();
            view.unmount();
            const restored = setup();
            expect(button(restored, 'Adicionar à grade: FGA0108, turma 01')).toBeTruthy();
        }
    );

    test('descarta turmas salvas sem carga horária', async () => {
        const { fireEvent } = dom.testing;
        localStorageRepository.set(STORAGE_KEYS.SCHEDULE, [
            { code: 'FGA0108', name: subject.name, classroom },
            {
                code: 'FGA0001',
                name: subject.name,
                hours: 60,
                classroom: { ...classroom, schedule: '24M12' }
            }
        ]);
        const view = setup();
        fireEvent.click(view.getByRole('button', { name: 'Ver grade' }));
        await view.findByRole('dialog', { name: 'Minha grade semanal' });
        expect(view.getByText('60h')).toBeTruthy();
        expect(view.queryByText('FGA0108')).toBeNull();
    });

    test('bloqueia turmas acima da carga máxima por período do curso', async () => {
        const { fireEvent } = dom.testing;
        const view = dom.testing.render(
            <SchedulePlanner maxHours={100}>
                <SchedulePreview />
                <AddToSchedule subject={subject} classroom={classroom} />
                <AddToSchedule
                    subject={{ ...subject, code: 'FGA0001' }}
                    classroom={{ ...classroom, schedule: '24M12' }}
                />
                <AddToSchedule
                    subject={{ ...subject, code: 'FGA0002', hours: 30 }}
                    classroom={{ ...classroom, schedule: '6M12' }}
                />
                <AddToSchedule
                    subject={{ ...subject, code: 'FGA0003' }}
                    classroom={{ ...classroom, semester: '2027.1' }}
                />
            </SchedulePlanner>
        );
        const add = (code: string) => button(view, `Adicionar à grade: ${code}, turma 01`);
        fireEvent.click(add('FGA0108'));
        fireEvent.click(add('FGA0001'));
        expect(view.getByText(/ultrapassa a carga horária máxima de 100h/)).toBeTruthy();
        expect(JSON.parse(localStorage.getItem('followw:schedule')!)).toHaveLength(1);
        expect(add('FGA0002').hasAttribute('disabled')).toBe(false);
        expect(add('FGA0003').hasAttribute('disabled')).toBe(false);
        fireEvent.click(add('FGA0002'));
        fireEvent.click(button(view, 'Remover da grade: FGA0108, turma 01'));
        expect(add('FGA0001').hasAttribute('disabled')).toBe(false);
        fireEvent.click(add('FGA0001'));
        fireEvent.click(button(view, 'Ver grade'));
        await view.findByRole('dialog', { name: 'Minha grade semanal' });
        expect(view.getByText('90h de 100h')).toBeTruthy();
    });

    test.each(['24M12', null])(
        'avisa sobre matéria repetida mesmo sem conflito de horário: %s',
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
            expect(
                button(view, 'Adicionar à grade: FGA0108, turma 02').hasAttribute('disabled')
            ).toBe(false);
            fireEvent.click(button(view, 'Adicionar à grade: FGA0108, turma 01'));
            fireEvent.click(button(view, 'Adicionar à grade: FGA0108, turma 02'));
            expect(view.getByText(/já está na grade do semestre 2026.2, na turma 01/)).toBeTruthy();
            expect(JSON.parse(localStorage.getItem('followw:schedule')!)).toHaveLength(1);
            fireEvent.click(button(view, 'Remover da grade: FGA0108, turma 01'));
            fireEvent.click(button(view, 'Adicionar à grade: FGA0108, turma 02'));
            expect(
                button(view, 'Remover da grade: FGA0108, turma 02').getAttribute('aria-pressed')
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
        fireEvent.click(view.getByRole('button', { name: 'Ver grade' }));
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
        fireEvent.click(view.getByRole('button', { name: 'Ver grade' }));
        await view.findByRole('dialog', { name: 'Minha grade semanal' });
        expect(view.getByRole('dialog', { name: 'Minha grade semanal' }).className).toContain(
            'sm:max-w-3xl'
        );
        const table = view.getByRole('table');
        expect(view.getByRole('button', { name: 'Baixar imagem' }).hasAttribute('disabled')).toBe(
            false
        );
        expect(table.textContent).toContain('14:00–14:55');
        expect(table.textContent).toContain('14:55–15:50');
        const row = dom.testing.within(table).getAllByRole('row')[1];
        const cells = dom.testing.within(row).getAllByRole('cell');
        expect(cells[1].textContent).toContain('FGA0108');
        expect(cells[3].textContent).toContain('FGA0108');
        expect(cells[0].textContent).toBe('—');
        const listItem = view.getByRole('listitem');
        expect(listItem.textContent).toContain('Matemática Discreta 2');
        expect(listItem.textContent).toContain('FGA0108 · T01');
        expect(listItem.textContent).not.toContain('2026.2');
        fireEvent.click(
            view.getAllByRole('button', { name: 'Remover da grade: FGA0108, turma 01' })[0]
        );
        expect(view.queryByRole('table')).toBeNull();
        expect(view.getByRole('button', { name: 'Baixar imagem' }).hasAttribute('disabled')).toBe(
            true
        );
        expect(
            view.getByText('Adicione turmas nos resultados da busca para montar sua grade.')
        ).toBeTruthy();
    });

    test('avisa sobre sobreposição parcial e permite adicionar após remover o conflito', async () => {
        const { fireEvent } = dom.testing;
        const view = setup({ schedule: '3T3' });
        fireEvent.click(button(view, 'Adicionar à grade: FGA0108, turma 01'));
        const blocked = button(view, 'Adicionar à grade: FGA0001, turma 01');
        expect(blocked.hasAttribute('disabled')).toBe(false);
        fireEvent.click(blocked);
        expect(view.getByText(/O horário de .*FGA0001.* conflita com .*FGA0108/)).toBeTruthy();
        expect(JSON.parse(localStorage.getItem('followw:schedule')!)).toHaveLength(1);
        fireEvent.click(blocked);
        expect(view.getAllByText('Não foi possível adicionar à grade')).toHaveLength(1);
        fireEvent.click(await view.findByRole('button', { name: 'Fechar aviso' }));
        expect(
            view.getByText('Não foi possível adicionar à grade').closest('[data-ending-style]') !==
                null
        ).toBe(true);
        fireEvent.click(button(view, 'Remover da grade: FGA0108, turma 01'));
        expect(blocked.hasAttribute('disabled')).toBe(false);
        fireEvent.click(blocked);
        fireEvent.click(view.getByRole('button', { name: 'Ver grade' }));
        await view.findByRole('dialog', { name: 'Minha grade semanal' });
        expect(view.getByRole('table').textContent).toContain('FGA0001');
        expect(view.getByRole('table').textContent).not.toContain('FGA0108');
    });

    test('barra aparece com turmas selecionadas e limpar esvazia a grade', () => {
        const { fireEvent } = dom.testing;
        const view = setup({ schedule: '24M12' });
        expect(view.queryByRole('toolbar')).toBeNull();
        fireEvent.click(button(view, 'Adicionar à grade: FGA0108, turma 01'));
        expect(view.getByRole('toolbar', { name: 'Turmas selecionadas' }).textContent).toContain(
            '1 turma'
        );
        fireEvent.click(button(view, 'Adicionar à grade: FGA0001, turma 01'));
        expect(view.getByRole('toolbar').textContent).toContain('2 turmas');
        fireEvent.click(button(view, 'Limpar seleção'));
        expect(view.queryByRole('toolbar')).toBeNull();
        expect(localStorage.getItem('followw:schedule')).toBeNull();
    });

    test('salva a grade no localStorage e restaura ao remontar', () => {
        const { fireEvent } = dom.testing;
        const view = setup({ schedule: '24M12' });
        fireEvent.click(button(view, 'Adicionar à grade: FGA0108, turma 01'));
        fireEvent.click(button(view, 'Adicionar à grade: FGA0001, turma 01'));
        expect(JSON.parse(localStorage.getItem('followw:schedule')!)).toHaveLength(2);
        view.unmount();
        const restored = setup({ schedule: '24M12' });
        expect(
            button(restored, 'Remover da grade: FGA0108, turma 01').getAttribute('aria-pressed')
        ).toBe('true');
        fireEvent.click(button(restored, 'Remover da grade: FGA0001, turma 01'));
        expect(JSON.parse(localStorage.getItem('followw:schedule')!)).toHaveLength(1);
    });

    test('fechar e reabrir mantém seleção', async () => {
        const { fireEvent } = dom.testing;
        const view = setup({ schedule: '35T4' });
        for (const code of ['FGA0108', 'FGA0001'])
            fireEvent.click(
                view.getByRole('button', { name: `Adicionar à grade: ${code}, turma 01` })
            );
        const trigger = view.getByRole('button', { name: 'Ver grade' });
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
        fireEvent.click(view.getByRole('button', { name: 'Ver grade' }));
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
        fireEvent.click(view.getByRole('button', { name: 'Ver grade' }));
        await view.findByRole('dialog', { name: 'Minha grade semanal' });
        expect(view.getByText('FGA0001 · T01: horário a definir.')).toBeTruthy();
        expect(view.getByRole('heading', { name: 'Semestre 2027.1' })).toBeTruthy();
        expect(view.getAllByRole('table')).toHaveLength(1);
        expect(view.queryByText('Choque de horário')).toBeNull();
    });
});
