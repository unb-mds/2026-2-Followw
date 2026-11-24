import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { MaterialDownload } from '@/components/classroom/MaterialDownload';

import { fakeApi, materialFile } from '../../fakes';

jest.mock('expo-file-system', () => ({
    Paths: { cache: 'file:///cache/' },
    File: jest.fn().mockImplementation((dir: string, name: string) => ({
        uri: `${dir}${name}`,
        create: jest.fn(),
        write: jest.fn(async () => {})
    }))
}));
jest.mock('expo-sharing', () => ({
    isAvailableAsync: jest.fn(async () => true),
    shareAsync: jest.fn(async () => {})
}));
jest.mock('lucide-react-native', () => ({ Download: 'View' }));
jest.mock('@/components/ui/icon', () => ({ Icon: 'View' }));
jest.mock('@/components/ui/button', () => ({ Button: 'Pressable' }));
jest.mock('@/lib/colors', () => ({ useColor: () => '#000' }));
jest.mock('@/components/ui/text', () => ({ Text: require('react-native').Text }));

const mount = () =>
    render(
        <QueryClientProvider client={new QueryClient()}>
            <MaterialDownload classroomId="AAA" postId={'material:' + 'a'.repeat(64)} />
        </QueryClientProvider>
    );

describe('botão de baixar material', () => {
    let server: ReturnType<typeof fakeApi>;

    beforeEach(() => {
        server = fakeApi(() => materialFile());
    });
    afterEach(() => server.eject());

    test('baixar abre o arquivo na folha de compartilhamento', async () => {
        const Sharing = jest.requireMock<{ shareAsync: jest.Mock }>('expo-sharing');
        await mount();
        await fireEvent.press(screen.getByText('Baixar'));
        await screen.findByText('Baixar');
        expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('alert')).toBeNull();
    });

    test('arquivo removido do SIGAA pede para atualizar as postagens', async () => {
        server.api.respond = () => Response.json({ detail: 'Not found' }, { status: 404 });
        await mount();
        await fireEvent.press(screen.getByText('Baixar'));
        expect(await screen.findByText(/Arquivo não encontrado/)).toBeTruthy();
    });

    test('outras falhas pedem para tentar novamente', async () => {
        server.api.respond = () => Response.json({ detail: 'SIGAA down' }, { status: 502 });
        await mount();
        await fireEvent.press(screen.getByText('Baixar'));
        expect(
            await screen.findByText('Não foi possível baixar o arquivo. Tente novamente.')
        ).toBeTruthy();
    });
});
