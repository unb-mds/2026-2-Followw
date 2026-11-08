import { Stack } from 'expo-router';

export default function Layout() {
    return (
        <Stack screenOptions={{ headerLargeTitle: true, headerBackButtonDisplayMode: 'minimal' }}>
            <Stack.Screen name="index" options={{ title: 'Buscar' }} />
        </Stack>
    );
}
