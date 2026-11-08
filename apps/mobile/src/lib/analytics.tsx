import { useGlobalSearchParams, usePathname } from 'expo-router';
import { PostHogProvider, usePostHog } from 'posthog-react-native';
import { useEffect } from 'react';

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

type Analytics = {
    capture: (event: string, properties?: Record<string, string | number | boolean>) => void;
    reset: () => void;
};

const noopAnalytics: Analytics = { capture: () => {}, reset: () => {} };

/** PostHog do mesmo projeto do web (o `$lib` separa o app); sem chave nada é enviado. */
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
    if (!POSTHOG_KEY) return children;
    return (
        <PostHogProvider
            projectToken={POSTHOG_KEY}
            options={{ host: POSTHOG_HOST }}
            autocapture={{ captureScreens: false, captureTouches: false }}
        >
            <ScreenTracker />
            {children}
        </PostHogProvider>
    );
}

// o autocapture de telas é do React Navigation; no Expo Router a tela vem do pathname
function ScreenTracker() {
    const posthog = usePostHog();
    const pathname = usePathname();
    const params = useGlobalSearchParams();
    useEffect(() => {
        const properties = Object.fromEntries(
            Object.entries(params).filter(
                (entry): entry is [string, string | string[]] => entry[1] !== undefined
            )
        );
        void posthog.screen(pathname, properties);
    }, [posthog, pathname, params]);
    return null;
}

export function useAnalytics(): Analytics {
    const posthog = usePostHog();
    if (!POSTHOG_KEY) return noopAnalytics;
    return {
        capture: (event, properties) => posthog.capture(event, properties),
        reset: () => posthog.reset()
    };
}
