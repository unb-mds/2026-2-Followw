import { render, screen } from '@testing-library/react-native';

import { ClassCard } from '@/components/home/ClassCard';

jest.mock('lucide-react-native', () => ({ Award: 'View', MapIcon: 'View', MapPin: 'View' }));
jest.mock('@/components/ui/icon', () => ({ Icon: 'View' }));
jest.mock('@/components/ui/text', () => ({ Text: require('react-native').Text }));
jest.mock('@/components/ui/button', () => ({ Button: 'View' }));
jest.mock('@/components/ui/badge', () => ({ Badge: 'View' }));
jest.mock('@/components/ui/card', () => ({ Card: 'View' }));
jest.mock('@/components/ui/skeleton', () => ({ Skeleton: 'View' }));

describe('ClassCard', () => {
    test('turma planejada mostra o código acima do título e o horário abaixo', async () => {
        await render(
            <ClassCard variant="planned" code="FGA0001" title="Cálculo 1" time="Seg 08:00–09:50" />
        );
        const texts = screen
            .getAllByText(/FGA0001|Cálculo 1|Seg 08:00/)
            .map((node) => node.props.children);
        expect(texts).toEqual(['FGA0001', 'Cálculo 1', 'Seg 08:00–09:50']);
    });

    test('local nulo avisa que não foi informado e indefinido some', async () => {
        await render(<ClassCard title="Cálculo 1" time="08:00–09:50" location={null} />);
        expect(screen.getByText('Local não informado')).toBeTruthy();
        await render(<ClassCard title="Cálculo 1" time="08:00–09:50" />);
        expect(screen.queryByText('Local não informado')).toBeNull();
    });

    test('a menção lançada ocupa o lugar do local', async () => {
        await render(<ClassCard title="Cálculo 1" time="08:00" grade="SS" location="S1" />);
        expect(screen.queryByText(/S1/)).toBeNull();
    });
});
