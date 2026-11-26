import { Stack, router } from 'expo-router';
import { act, getMockContext, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import TabsLayout from '@/app/(tabs)/_layout';

// árvore real de rotas, com as telas trocadas por stubs
function routes() {
    const screens = getMockContext('src/app')
        .keys()
        .map((file) => file.replace(/^\.\//, '').replace(/\.tsx$/, ''))
        .filter((name) => !name.endsWith('_layout'));
    return {
        ...Object.fromEntries(screens.map((name) => [name, () => <Text>{name}</Text>])),
        _layout: () => <Stack screenOptions={{ headerShown: false }} />,
        '(tabs)/_layout': TabsLayout
    };
}

test('voltar da turma aberta pela home retorna para a home', async () => {
    await renderRouter(routes(), { initialUrl: '/' });
    // com a aba Turmas já visitada, a turma era empilhada sobre a lista
    await act(async () => router.navigate('/turmas'));
    await act(async () => router.navigate('/'));
    await act(async () => router.push({ pathname: '/turmas/[id]', params: { id: '1' } }));
    expect(screen).toHavePathname('/turmas/1');
    expect(screen.getByText('turmas/[id]/index')).toBeTruthy();

    await act(async () => router.back());
    expect(screen).toHavePathname('/');
});

test('voltar da turma aberta pela lista retorna para a lista', async () => {
    await renderRouter(routes(), { initialUrl: '/turmas' });
    await act(async () => router.push({ pathname: '/turmas/[id]', params: { id: '1' } }));

    await act(async () => router.back());
    expect(screen).toHavePathname('/turmas');
});
