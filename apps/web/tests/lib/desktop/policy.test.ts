import { describe, expect, test } from 'bun:test';

import { isDesktopDevice, type DeviceSignals } from '#/lib/desktop';

const notebook: DeviceSignals = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    platform: 'Win32',
    maxTouchPoints: 0,
    mobile: false,
    space: true,
    preciseInput: true
};

describe('elegibilidade desktop', () => {
    test.each([
        { ...notebook },
        { ...notebook, maxTouchPoints: 10 },
        { ...notebook, userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64' },
        { ...notebook, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel' }
    ])('habilita computadores identificados, inclusive notebook touch: %j', (device) => {
        expect(isDesktopDevice(device)).toBe(true);
    });
    test.each([
        { ...notebook, space: false },
        { ...notebook, preciseInput: false },
        { ...notebook, mobile: true },
        { ...notebook, userAgent: 'Mozilla/5.0 (Linux; Android 14; Tablet)', maxTouchPoints: 10 },
        { ...notebook, userAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile)' },
        { ...notebook, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17)' },
        {
            ...notebook,
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
            platform: 'MacIntel',
            maxTouchPoints: 5
        },
        { ...notebook, userAgent: '', platform: '' }
    ])('mantém layout atual sem evidências suficientes, mesmo com periféricos: %j', (device) => {
        expect(isDesktopDevice(device)).toBe(false);
    });
});
