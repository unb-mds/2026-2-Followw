import { act, render, screen } from '@testing-library/react-native';

import { Toaster, toast } from '@/components/ui/toast';

jest.mock('lucide-react-native', () => ({
    CircleCheck: 'View',
    Info: 'View',
    OctagonX: 'View',
    TriangleAlert: 'View',
    X: 'View'
}));
jest.mock('react-native-reanimated', () => {
    const chain = { duration: () => chain, reduceMotion: () => chain };
    return {
        __esModule: true,
        default: { View: require('react-native').View },
        FadeOut: chain,
        SlideInUp: chain,
        ReduceMotion: { System: 'system' }
    };
});
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));
jest.mock('@/components/ui/button', () => ({ Button: 'Pressable' }));
jest.mock('@/components/ui/icon', () => ({ Icon: 'View' }));
jest.mock('@/components/ui/text', () => ({ Text: require('react-native').Text }));

describe('toast', () => {
    afterEach(async () => {
        await act(async () => toast.close());
    });

    test('exibe título e descrição do aviso adicionado', async () => {
        await render(<Toaster />);
        await act(async () => {
            toast.add({ title: 'Aviso', description: 'Detalhe', type: 'warning' });
        });
        expect(screen.getByText('Aviso')).toBeTruthy();
        expect(screen.getByText('Detalhe')).toBeTruthy();
    });

    test('mesmo id substitui o aviso em vez de duplicar', async () => {
        await render(<Toaster />);
        await act(async () => {
            toast.add({ id: 'x', title: 'Primeiro' });
            toast.add({ id: 'x', title: 'Segundo' });
        });
        expect(screen.queryByText('Primeiro')).toBeNull();
        expect(screen.getByText('Segundo')).toBeTruthy();
    });

    test('some depois do tempo limite', async () => {
        jest.useFakeTimers();
        await render(<Toaster />);
        await act(async () => {
            toast.add({ title: 'Temporário', timeout: 1000 });
        });
        expect(screen.getByText('Temporário')).toBeTruthy();
        await act(async () => {
            jest.advanceTimersByTime(1100);
        });
        jest.useRealTimers();
        expect(screen.queryByText('Temporário')).toBeNull();
    });
});
