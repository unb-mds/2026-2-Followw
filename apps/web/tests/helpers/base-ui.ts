import { mock } from 'bun:test';
import { useLayoutEffect } from 'react';

// O Base UI escolhe o hook ao ser importado; antes do happy-dom vira noop e menus não abrem.
export async function mockBrowserLayoutEffect() {
    const { useIsoLayoutEffect } = await import('@base-ui/utils/useIsoLayoutEffect');
    await mock.module('@base-ui/utils/useIsoLayoutEffect', () => ({
        useIsoLayoutEffect: useLayoutEffect
    }));
    return async () => {
        await mock.module('@base-ui/utils/useIsoLayoutEffect', () => ({ useIsoLayoutEffect }));
    };
}
