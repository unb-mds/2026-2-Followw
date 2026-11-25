import { render, screen } from '@testing-library/react-native';

import { WeeklySchedule } from '@/components/schedule/WeeklySchedule';

jest.mock('@/components/ui/text', () => ({ Text: require('react-native').Text }));

const entry = (code: string, schedule: string | null) => ({
    key: code,
    code,
    name: `Matéria ${code}`,
    number: '1',
    schedule
});

describe('WeeklySchedule', () => {
    test('desenha um bloco por aula com dia e horário', async () => {
        await render(<WeeklySchedule label="Grade" entries={[entry('FGA0001', '24M12')]} />);
        expect(
            screen.getByLabelText('Seg, 08:00–09:50: Matéria FGA0001, FGA0001, turma 1')
        ).toBeTruthy();
        expect(
            screen.getByLabelText('Qua, 08:00–09:50: Matéria FGA0001, FGA0001, turma 1')
        ).toBeTruthy();
    });

    test('sábado só aparece quando há aula nele', async () => {
        await render(<WeeklySchedule label="Grade" entries={[entry('A', '2M12')]} />);
        expect(screen.queryByText('Sáb')).toBeNull();
        await render(<WeeklySchedule label="Grade" entries={[entry('A', '7M12')]} />);
        expect(screen.getByText('Sáb')).toBeTruthy();
    });

    test('turma sem horário é listada abaixo da grade', async () => {
        await render(<WeeklySchedule label="Grade" entries={[entry('B', null)]} />);
        expect(screen.getByText('B · T1: horário a definir.')).toBeTruthy();
    });
});
