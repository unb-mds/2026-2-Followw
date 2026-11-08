import type { PlannedClass } from '@followw/core/lib/planned-schedule.ts';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';

import { usePlannedSchedule } from '@/components/schedule/usePlannedSchedule';
import { toast } from '@/components/ui/toast';
import { clearAccountStorage } from '@/lib/storage';

jest.mock('@/components/ui/toast', () => ({ toast: { add: jest.fn() } }));

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
            result.current.toggle(turma('A', '1', '24M12'));
        });
        expect(result.current.items).toHaveLength(1);
        await act(async () => {
            result.current.toggle(turma('A', '1', '24M12'));
        });
        expect(result.current.items).toHaveLength(0);
    });

    test('choque de horário avisa no toast e não adiciona', async () => {
        const { result } = await renderHook(() => usePlannedSchedule(), { wrapper });
        await act(async () => {
            result.current.toggle(turma('A', '1', '24M12'));
        });
        const add = jest.mocked(toast.add);
        await act(async () => {
            result.current.toggle(turma('B', '1', '24M12'));
        });
        expect(add).toHaveBeenCalledWith(
            expect.objectContaining({ description: expect.stringContaining('conflita') })
        );
        expect(result.current.items).toHaveLength(1);
    });
});
