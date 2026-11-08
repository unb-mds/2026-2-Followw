import { Stack } from 'expo-router';

export default function Layout() {
    return (
        <Stack screenOptions={{ headerLargeTitle: true, headerBackButtonDisplayMode: 'minimal' }}>
            <Stack.Screen name="index" options={{ title: 'RU' }} />
            <Stack.Screen
                name="carteirinha"
                options={{
                    presentation: 'formSheet',
                    headerShown: false,
                    sheetAllowedDetents: [0.7, 1],
                    sheetGrabberVisible: true
                }}
            />
        </Stack>
    );
}
