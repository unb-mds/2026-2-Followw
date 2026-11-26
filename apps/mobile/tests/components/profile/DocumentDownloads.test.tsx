import { render, screen } from '@testing-library/react-native';

import { DocumentDownloads } from '@/components/profile/DocumentDownloads';

jest.mock('lucide-react-native', () => ({
    Download: 'View',
    FileText: 'View',
    GraduationCap: 'View',
    IdCard: 'View'
}));
jest.mock('@/components/ui/icon', () => ({ Icon: 'View' }));
jest.mock('@/components/ui/text', () => ({
    Text: require('react-native').Text,
    TextClassContext: require('react').createContext(undefined)
}));
jest.mock('@/lib/colors', () => ({ useColor: () => '#000' }));
jest.mock('@/queries/documents', () => ({
    documentFailureMessage: () => '',
    shareDocument: jest.fn()
}));

describe('DocumentDownloads', () => {
    test('lista os documentos em ordem alfabética', async () => {
        await render(<DocumentDownloads />);
        const labels = screen.getAllByText(/^(Carteirinha|Histórico|Diploma)$/);
        expect(labels.map((label) => label.props.children)).toEqual([
            'Carteirinha',
            'Diploma',
            'Histórico'
        ]);
    });

    test('o diploma fica desativado', async () => {
        await render(<DocumentDownloads />);
        expect(screen.getByLabelText('Baixar diploma')).toBeDisabled();
        expect(screen.getByLabelText('Baixar histórico acadêmico')).toBeEnabled();
    });
});
