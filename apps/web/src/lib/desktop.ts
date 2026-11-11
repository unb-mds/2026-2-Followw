import { useSyncExternalStore } from 'react';

export const DESKTOP_SPACE = '(min-width: 1200px) and (min-height: 600px)';
const DESKTOP_INPUT = '(any-hover: hover) and (any-pointer: fine)';

export interface DeviceSignals {
    userAgent: string;
    platform: string;
    maxTouchPoints: number;
    mobile?: boolean;
    space: boolean;
    preciseInput: boolean;
}

export function isDesktopDevice(signals: DeviceSignals): boolean {
    const { userAgent, platform, maxTouchPoints, mobile, space, preciseInput } = signals;
    if (!space || !preciseInput || mobile) return false;
    if (/Android|iPhone|iPad|iPod|Mobile|Tablet|Silk/i.test(userAgent)) return false;
    if (/Mac/i.test(platform) && maxTouchPoints > 1) return false;
    return /Windows NT|Macintosh|X11|CrOS/i.test(userAgent);
}

function snapshot() {
    const agent = navigator as Navigator & { userAgentData?: { mobile: boolean } };
    return isDesktopDevice({
        userAgent: agent.userAgent,
        platform: agent.platform,
        maxTouchPoints: agent.maxTouchPoints,
        mobile: agent.userAgentData?.mobile,
        space: window.matchMedia(DESKTOP_SPACE).matches,
        preciseInput: window.matchMedia(DESKTOP_INPUT).matches
    });
}

function subscribe(listener: () => void) {
    const queries = [DESKTOP_SPACE, DESKTOP_INPUT].map((query) => window.matchMedia(query));
    for (const query of queries) query.addEventListener('change', listener);
    return () => {
        for (const query of queries) query.removeEventListener('change', listener);
    };
}

export function useDesktopEligibility() {
    return useSyncExternalStore(subscribe, snapshot, () => false);
}
