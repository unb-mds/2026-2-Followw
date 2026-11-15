import type { Classroom } from '@followw/core/queries/classrooms.ts';

import { afterAll, afterEach, beforeAll, expect, mock, test } from 'bun:test';
import { useLayoutEffect } from 'react';

import { clearAccountStorage } from '#/lib/local-storage';

import { useDom } from '../../helpers/dom';

let AcademicSimulator: typeof import('#/components/profile/AcademicSimulator').AcademicSimulator;

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
    ({ AcademicSimulator } = await import('#/components/profile/AcademicSimulator'));
});
afterAll(() => restoreLayoutEffect());
afterEach(() => clearAccountStorage());

const index = (container: HTMLElement, label: string) =>
    [...container.querySelectorAll('dt')].find((node) => node.textContent === label)
        ?.nextElementSibling?.textContent;
const currentLabel = 'Menção de Cálculo, 2026.2';
const grade = (container: HTMLElement, label: string) =>
    container.querySelector(`[aria-label="${label}"] [data-slot="select-value"]`)?.textContent;
const currentGrade = (container: HTMLElement) => grade(container, currentLabel);

const classrooms: Classroom[] = [
    {
        id: 'atual',
        number: '01',
        semester: '2026.2',
        current: true,
        subject: { code: 'A', name: 'CÁLCULO', hours: 60 },
        professors: []
    },
    {
        id: 'anterior',
        number: '01',
        semester: '2026.1',
        current: false,
        subject: { code: 'B', name: 'MÚSICA', hours: 60 },
        grade: 'MS',
        professors: []
    }
];

test('abre o semestre atual e recolhe as disciplinas anteriores preenchidas pelo SIGAA', () => {
    const { getByText, container } = dom.testing.render(
        <AcademicSimulator
            classrooms={classrooms}
            entry="2026.1"
            current="2026.2"
            curriculum={new Set(['A'])}
        />
    );
    expect(currentGrade(container)).toBe('Sem menção');
    expect(container.querySelector('details')?.open).toBe(false);
    dom.testing.fireEvent.click(getByText('Semestres anteriores'));
    expect(grade(container, 'Menção de Música, 2026.1')).toBe('MS');
    expect(getByText('Módulo livre')).toBeDefined();
});

test('recalcula na alteração, preserva ao voltar e restaura as menções ao limpar', async () => {
    const { render, fireEvent, findByRole } = dom.testing;
    const simulator = (
        <AcademicSimulator
            classrooms={classrooms}
            entry="2026.1"
            current="2026.2"
            curriculum={new Set(['A'])}
        />
    );
    const first = render(simulator);
    const current = { name: currentLabel };
    expect(index(first.container, 'IRA')).toBe('4');
    fireEvent.click(first.getByRole('combobox', current));
    const option = await findByRole(document.body, 'option', { name: 'SS' });
    fireEvent.pointerDown(option, { pointerType: 'mouse' });
    fireEvent.click(option);
    expect(index(first.container, 'IRA')).toBe('4,667');
    expect(index(first.container, 'MP')).toBe('5');
    expect(first.getByText('* Projeção para 2026.2.')).toBeDefined();
    first.unmount();

    const reopened = render(simulator);
    expect(currentGrade(reopened.container)).toBe('SS');
    fireEvent.click(reopened.getByRole('button', { name: 'Limpar simulação' }));
    expect(currentGrade(reopened.container)).toBe('Sem menção');
    expect(index(reopened.container, 'IRA')).toBe('4');
    expect(index(reopened.container, 'MP')).toBe('—');
    expect(reopened.queryByText('* Projeção para 2026.2.')).toBeNull();
});
