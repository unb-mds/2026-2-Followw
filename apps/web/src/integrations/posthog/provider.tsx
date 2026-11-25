import type { ReactNode } from 'react';

import { PostHogProvider as BasePostHogProvider } from '@posthog/react';
import { posthog } from 'posthog-js';

if (typeof window !== 'undefined' && import.meta.env.VITE_POSTHOG_KEY) {
    posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
        api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
        person_profiles: 'identified_only',
        cross_subdomain_cookie: false,
        disable_surveys: true,
        before_send: (event) => {
            const sensitivePage = /\/(?:autorizar|login)(?:[/?#]|$)/;
            return [
                window.location.href,
                event.properties.$current_url,
                event.properties.$referrer
            ].some((value) => typeof value === 'string' && sensitivePage.test(value))
                ? null
                : event;
        },
        capture_performance: {
            web_vitals: true,
            web_vitals_attribution: ['INP', 'LCP']
        },
        defaults: '2026-08-30'
    });
}

interface PostHogProviderProps {
    children: ReactNode;
}

export default function PostHogProvider({ children }: PostHogProviderProps) {
    return <BasePostHogProvider client={posthog}>{children}</BasePostHogProvider>;
}
