import type { RenderOptions, RenderResult } from '@testing-library/react/pure';

import { environmentManager } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll } from 'bun:test';
import { Window } from 'happy-dom';
import { LazyMotion, domMax } from 'motion/react';
import { createElement } from 'react';

type Library = typeof import('@testing-library/react/pure');
type Testing = Omit<Library, 'render'> & {
    render: (ui: React.ReactNode, options?: RenderOptions) => RenderResult;
};

// como o MotionProvider do app: sem o LazyMotion acima, o `m` não anima nem conclui saídas
const motionWrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(LazyMotion, { features: domMax }, children);

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
        const library = await import('@testing-library/react/pure');
        testing = {
            ...library,
            render: (ui, options) => library.render(ui, { wrapper: motionWrapper, ...options })
        };
    });

    afterEach(() => testing?.cleanup());

    afterAll(async () => {
        testing?.cleanup();
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
