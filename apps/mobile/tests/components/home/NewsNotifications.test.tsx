import type { Classroom, ClassroomPost } from '@followw/core/queries/classrooms.ts';

import { STORAGE_KEYS } from '@followw/core/lib/storage-keys.ts';
import { latestPostsQueryOptions } from '@followw/core/queries/posts.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { NewsNotifications } from '@/components/home/NewsNotifications';
import { clearAccountStorage, storage } from '@/lib/storage';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('lucide-react-native', () => ({ Bell: 'View' }));
jest.mock('@/components/ui/icon', () => ({ Icon: 'View' }));
jest.mock('@/components/ui/skeleton', () => ({ Skeleton: 'View' }));
jest.mock('@/components/ui/button', () => ({ Button: 'View' }));
jest.mock('@/components/ui/text', () => ({ Text: require('react-native').Text }));
jest.mock('@/components/ErrorState', () => ({
    ErrorCard: 'View',
    StaleDataNotice: 'View',
    SIGAA_DOWN_MESSAGE: ''
}));
// abre ao tocar no gatilho e mostra o conteúdo sempre, sem animação
jest.mock('@/components/ui/drawer', () => {
    const { createContext, useContext } = require('react');
    const { Pressable, View, Text } = require('react-native');
    const Open = createContext((_open: boolean) => {});
    return {
        Drawer: ({
            children,
            onOpenChange
        }: {
            children: unknown;
            onOpenChange: (open: boolean) => void;
        }) => <Open.Provider value={onOpenChange}>{children}</Open.Provider>,
        DrawerTrigger: ({ children }: { children: unknown }) => {
            const open = useContext(Open);
            return (
                <Pressable testID="trigger" onPress={() => open(true)}>
                    {children}
                </Pressable>
            );
        },
        DrawerContent: View,
        DrawerHeader: View,
        DrawerTitle: Text
    };
});

const classroom = {
    id: 'AAA',
    subject: { code: 'FGA0001', name: 'Cálculo' }
} as Classroom;

const post = (
    type: 'news' | 'assessment',
    id: number,
    extra: Partial<ClassroomPost> = {}
): ClassroomPost => ({
    id: `${type}:${id}`,
    type,
    title: `${type === 'news' ? 'Notícia' : 'Avaliação'} ${id}`,
    attachments: [],
    is_read: false,
    ...extra
});

function mount(posts: ClassroomPost[] | null) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } }
    });
    // sem dados, a consulta fica pendente em vez de depender da rede
    if (!posts)
        client.setQueryDefaults(latestPostsQueryOptions.queryKey, {
            queryFn: () => new Promise(() => {})
        });
    if (posts)
        client.setQueryData(latestPostsQueryOptions.queryKey, {
            items: posts.map((item) => ({ classroom, post: item })),
            updating: false
        });
    return render(
        <QueryClientProvider client={client}>
            <NewsNotifications />
        </QueryClientProvider>
    );
}

describe('notificações do início', () => {
    beforeEach(() => clearAccountStorage());

    test('avaliação mostra o rótulo no lugar da prévia', async () => {
        await mount([post('assessment', 1, { starts_on: '2026-10-29', time_label: '14:00' })]);
        expect(screen.getByText('Avaliação 1')).toBeTruthy();
        expect(screen.getByText('Avaliação')).toBeTruthy();
        expect(screen.queryByText('Toque para ler mais.')).toBeNull();
    });

    test('avaliação nova volta a mostrar o ponto mesmo com a notícia já vista', async () => {
        storage.set(STORAGE_KEYS.SEEN_NEWS, JSON.stringify('AAA:news:1'));
        await mount([post('news', 1), post('assessment', 1)]);
        expect(screen.getByTestId('unread-dot')).toBeTruthy();

        await fireEvent.press(screen.getByTestId('trigger'));

        expect(screen.queryByTestId('unread-dot')).toBeNull();
        expect(storage.getString(STORAGE_KEYS.SEEN_NEWS)).toBe(
            JSON.stringify('AAA:news:1,AAA:assessment:1')
        );
    });

    test('sem novidades informa a ausência de notificações', async () => {
        await mount([]);
        expect(screen.queryByTestId('unread-dot')).toBeNull();
        expect(screen.getByText('Nenhuma notificação por enquanto.')).toBeTruthy();
    });

    test('carregando mostra o esboço anunciado pelo rótulo', async () => {
        await mount(null);
        expect(screen.getByLabelText('Carregando notificações...')).toBeTruthy();
    });
});
