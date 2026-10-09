import type { ReactNode } from 'react';

import { PostHogProvider as BasePostHogProvider } from '@posthog/react';
import { posthog } from 'posthog-js';

if (typeof window !== 'undefined' && import.meta.env.VITE_POSTHOG_KEY) {
    posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
        api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
        person_profiles: 'identified_only',
        cross_subdomain_cookie: false,
        defaults: '2026-08-30'
    });
}

interface PostHogProviderProps {
    children: ReactNode;
}

export default function PostHogProvider({ children }: PostHogProviderProps) {
    return <BasePostHogProvider client={posthog}>{children}</BasePostHogProvider>;
}
