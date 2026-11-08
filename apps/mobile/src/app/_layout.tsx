import '@/global.css';
import {
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    useFonts
} from '@expo-google-fonts/dm-sans';
import { PortalHost } from '@rn-primitives/portal';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { AnalyticsProvider } from '@/lib/analytics';
import { useNavigationTheme } from '@/lib/colors';
import {
    PERSIST_BUSTER,
    PERSIST_MAX_AGE,
    persister,
    queryClient,
    shouldPersistQuery
} from '@/lib/query-client';
import { installApiClient } from '@/lib/session';
import { applyStoredTheme } from '@/lib/theme';
import { useSessionRefresh } from '@/queries/auth';

installApiClient();
applyStoredTheme();
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
    const [fontsLoaded] = useFonts({
        DMSans_400Regular,
        DMSans_500Medium,
        DMSans_600SemiBold,
        DMSans_700Bold
    });
    const [restored, setRestored] = useState(false);
    const ready = fontsLoaded && restored;
    useEffect(() => {
        if (ready) SplashScreen.hide();
    }, [ready]);

    return (
        <AnalyticsProvider>
            <PersistQueryClientProvider
                client={queryClient}
                persistOptions={{
                    persister,
                    maxAge: PERSIST_MAX_AGE,
                    buster: PERSIST_BUSTER,
                    dehydrateOptions: { shouldDehydrateQuery: (query) => shouldPersistQuery(query) }
                }}
                onSuccess={() => setRestored(true)}
                onError={() => setRestored(true)}
            >
                {ready && <RootNavigator />}
            </PersistQueryClientProvider>
        </AnalyticsProvider>
    );
}

function RootNavigator() {
    useSessionRefresh();
    const theme = useNavigationTheme();
    return (
        <ThemeProvider value={theme}>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                    name="login"
                    options={{ presentation: 'modal', title: 'Entrar com o SIGAA' }}
                />
                <Stack.Screen name="privacidade" options={{ title: 'Privacidade' }} />
                <Stack.Screen name="cursos/[id]" options={{ title: 'Curso' }} />
                <Stack.Screen name="professores/[siape]" options={{ title: 'Professor' }} />
            </Stack>
            <PortalHost />
        </ThemeProvider>
    );
}
