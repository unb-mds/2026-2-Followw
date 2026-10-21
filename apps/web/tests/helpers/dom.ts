import { environmentManager } from '@tanstack/react-query';
import { afterAll, beforeAll } from 'bun:test';
import { Window } from 'happy-dom';

type Testing = typeof import('@testing-library/react/pure');

// navegador happy-dom para o arquivo de teste; a Testing Library só existe depois do beforeAll
export function useDom(url = 'http://localhost/') {
    let testing: Testing | undefined;
    let browser: Window | undefined;
    const wasServer = environmentManager.isServer();
    const previousGlobals = new Map<string, PropertyDescriptor | undefined>();

    beforeAll(async () => {
        environmentManager.setIsServer(() => false);
        browser = new Window({ url });
        const globals = {
            window: browser,
            document: browser.document,
            navigator: browser.navigator,
            location: browser.location,
            history: browser.history,
            localStorage: browser.localStorage,
            HTMLElement: browser.HTMLElement,
            HTMLInputElement: browser.HTMLInputElement,
            HTMLFormElement: browser.HTMLFormElement,
            Element: browser.Element,
            Node: browser.Node,
            Event: browser.Event,
            DocumentFragment: browser.DocumentFragment,
            MutationObserver: browser.MutationObserver,
            ResizeObserver: browser.ResizeObserver,
            getComputedStyle: browser.getComputedStyle.bind(browser),
            requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
            cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
            scrollTo: browser.scrollTo.bind(browser),
            IS_REACT_ACT_ENVIRONMENT: true
        };
        for (const [key, value] of Object.entries(globals)) {
            previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
            Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
        }
        testing = await import('@testing-library/react/pure');
    });

    afterAll(async () => {
        environmentManager.setIsServer(() => wasServer);
        await browser?.happyDOM.abort();
        for (const [key, descriptor] of previousGlobals) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else Reflect.deleteProperty(globalThis, key);
        }
    });

    return {
        get testing(): Testing {
            if (!testing) throw new Error('useDom só vale dentro dos testes');
            return testing;
        }
    };
}
