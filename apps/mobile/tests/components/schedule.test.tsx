import type { PlannedClass } from '@followw/core/lib/planned-schedule.ts';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';

import { usePlannedSchedule } from '@/components/schedule/usePlannedSchedule';
import { clearAccountStorage } from '@/lib/storage';

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const turma = (code: string, number: string, schedule: string): PlannedClass => ({
    code,
    name: `Matéria ${code}`,
    hours: 60,
    number,
    schedule,
    semester: '2026.1',
    room: null,
    professors: []
});

describe('usePlannedSchedule', () => {
    beforeEach(() => clearAccountStorage());

    test('adiciona e remove a turma da grade', async () => {
        const { result } = await renderHook(() => usePlannedSchedule(), { wrapper });
        await act(async () => {
            expect(result.current.toggle(turma('A', '1', '24M12'))).toBeNull();
        });
        expect(result.current.items).toHaveLength(1);
        await act(async () => {
            result.current.toggle(turma('A', '1', '24M12'));
        });
        expect(result.current.items).toHaveLength(0);
    });

    test('choque de horário devolve o motivo e não adiciona', async () => {
        const { result } = await renderHook(() => usePlannedSchedule(), { wrapper });
        await act(async () => {
            result.current.toggle(turma('A', '1', '24M12'));
        });
        let error: string | null = null;
        await act(async () => {
            error = result.current.toggle(turma('B', '1', '24M12'));
        });
        expect(error).toContain('conflita');
        expect(result.current.items).toHaveLength(1);
    });
});
