import type { UseQueryResult } from '@tanstack/react-query';

import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { QueryState } from '@/components/QueryState';

jest.mock('@/components/ErrorState', () => ({ ErrorCard: 'View' }));
jest.mock('@/components/ui/skeleton', () => ({ Skeleton: 'View' }));
jest.mock('@/components/ui/text', () => ({ Text: require('react-native').Text }));
jest.mock('@/lib/colors', () => ({ useColor: () => '#000' }));

const pending = { isPending: true } as UseQueryResult<string>;
const props = { query: pending, loading: 'Carregando turmas...', error: '', stale: '' };

describe('carregamento do QueryState', () => {
    test('com esboço, mostra o layout do resultado anunciado pelo rótulo', async () => {
        await render(<QueryState {...props} skeleton={<Text>esboço</Text>} />);
        expect(screen.getByRole('progressbar', { name: 'Carregando turmas...' })).toBeTruthy();
        expect(screen.getByText('esboço')).toBeTruthy();
    });

    test('sem esboço, o layout é incerto e fica o spinner com o texto', async () => {
        await render(<QueryState {...props} />);
        expect(screen.getByText('Carregando turmas...')).toBeTruthy();
    });
});
