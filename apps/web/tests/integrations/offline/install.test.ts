import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

import {
    dismissInstallCard,
    getInstallMode,
    initializeInstallSupport,
    promptInstall,
    subscribeInstallSupport
} from '#/integrations/offline/install';

class FakeDisplayMode extends EventTarget {
    matches = false;

    change(matches: boolean) {
        this.matches = matches;
        this.dispatchEvent(new Event('change'));
    }
}

class FakeWindow extends EventTarget {
    navigator = {
        userAgent: 'Mozilla/5.0 (Linux; Android 15)',
        platform: 'Linux armv8l',
        maxTouchPoints: 5,
        standalone: false
    };
    displayMode = new FakeDisplayMode();
    values = new Map<string, string>();
    localStorage = {
        getItem: (key: string) => this.values.get(key) ?? null,
        setItem: (key: string, value: string) => this.values.set(key, value)
    };
    matchMedia = () => this.displayMode;
}

function installEvent(outcome: 'accepted' | 'dismissed' = 'dismissed') {
    return Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: mock(async () => {}),
        userChoice: Promise.resolve({ outcome })
    });
}

const SAFARI = 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const realWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

describe('instalação do app', () => {
    let browser: FakeWindow;
    let cleanups: (() => void)[];

    function initialize() {
        const cleanup = initializeInstallSupport();
        cleanups.push(cleanup);
        return cleanup;
    }

    beforeEach(() => {
        cleanups = [];
        browser = new FakeWindow();
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: browser
        });
    });

    afterEach(() => {
        for (const cleanup of cleanups) cleanup();
        if (realWindow) Object.defineProperty(globalThis, 'window', realWindow);
        else Reflect.deleteProperty(globalThis, 'window');
    });

    test('funciona no SSR sem window', async () => {
        Reflect.deleteProperty(globalThis, 'window');
        expect(initializeInstallSupport()).toBeFunction();
        expect(getInstallMode()).toBeNull();
        expect(await promptInstall()).toBeUndefined();
    });

    test.each(['iPhone', 'iPad', 'iPod'])('oferece instruções para %s', (device) => {
        browser.navigator.userAgent = `Mozilla/5.0 (${device}) ${SAFARI}`;
        initialize();
        expect(getInstallMode()).toBe('ios');
    });

    test.each(['CriOS/120.0', 'FxiOS/120.0', 'Instagram 300.0'])(
        'oculta as instruções do Safari em outros navegadores do iOS (%s)',
        (browserName) => {
            browser.navigator.userAgent = `Mozilla/5.0 (iPhone) ${SAFARI} ${browserName}`;
            initialize();
            expect(getInstallMode()).toBeNull();
        }
    );

    test('reconhece iPadOS com identificação de desktop', () => {
        browser.navigator.userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) ${SAFARI}`;
        browser.navigator.platform = 'MacIntel';
        initialize();
        expect(getInstallMode()).toBe('ios');
    });

    test('oculta em dispositivos sem prompt disponível, inclusive Mac sem touch', () => {
        browser.navigator.platform = 'MacIntel';
        browser.navigator.maxTouchPoints = 0;
        initialize();
        expect(getInstallMode()).toBeNull();
    });

    test.each(['display-mode', 'navigator.standalone'])(
        'oculta quando %s indica app instalado',
        (indicator) => {
            browser.navigator.userAgent = `Mozilla/5.0 (iPhone) ${SAFARI}`;
            if (indicator === 'display-mode') browser.displayMode.matches = true;
            else browser.navigator.standalone = true;
            initialize();
            browser.dispatchEvent(installEvent());
            expect(getInstallMode()).toBeNull();
        }
    );

    test('captura o evento nativo e só chama prompt depois da ação do usuário', async () => {
        initialize();
        const event = installEvent();
        browser.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(event.prompt).not.toHaveBeenCalled();
        expect(getInstallMode()).toBe('native');
        await promptInstall();
        expect(event.prompt).toHaveBeenCalledTimes(1);
    });

    test('preserva o evento durante a desmontagem e remontagem do root', async () => {
        const cleanup = initialize();
        const event = installEvent();
        browser.dispatchEvent(event);
        cleanup();
        initialize();
        expect(getInstallMode()).toBe('native');
        await promptInstall();
        expect(event.prompt).toHaveBeenCalledTimes(1);
    });

    test('remove os listeners na desmontagem', () => {
        const cleanup = initialize();
        cleanup();
        const event = installEvent();
        browser.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(getInstallMode()).toBeNull();
    });

    test('notifica assinantes somente quando o modo muda e permite cancelar a assinatura', () => {
        initialize();
        const listener = mock(() => {});
        const unsubscribe = subscribeInstallSupport(listener);
        browser.dispatchEvent(installEvent());
        browser.dispatchEvent(installEvent());
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        browser.dispatchEvent(new Event('appinstalled'));
        expect(listener).toHaveBeenCalledTimes(1);
    });

    test('persiste a dispensa e ignora novos eventos', () => {
        initialize();
        browser.dispatchEvent(installEvent());
        dismissInstallCard();
        expect(getInstallMode()).toBeNull();
        expect(browser.values.get('followw:install-dismissed')).toBe('1');
        browser.dispatchEvent(installEvent());
        expect(getInstallMode()).toBeNull();
    });

    test('respeita a dispensa já salva no dispositivo', () => {
        browser.navigator.userAgent = `Mozilla/5.0 (iPhone) ${SAFARI}`;
        browser.values.set('followw:install-dismissed', '1');
        initialize();
        expect(getInstallMode()).toBeNull();
    });

    test('volta a sugerir quando a dispensa salva é de uma versão anterior', () => {
        browser.navigator.userAgent = `Mozilla/5.0 (iPhone) ${SAFARI}`;
        browser.values.set('followw:install-dismissed', '0');
        initialize();
        expect(getInstallMode()).toBe('ios');
    });

    test('oculta após appinstalled e ignora eventos nativos tardios', () => {
        initialize();
        browser.dispatchEvent(installEvent());
        browser.dispatchEvent(new Event('appinstalled'));
        expect(getInstallMode()).toBeNull();
        browser.dispatchEvent(installEvent());
        expect(getInstallMode()).toBeNull();
    });

    test('oculta quando o display-mode muda para standalone', () => {
        initialize();
        browser.dispatchEvent(installEvent());
        browser.displayMode.change(true);
        expect(getInstallMode()).toBeNull();
        browser.dispatchEvent(installEvent());
        expect(getInstallMode()).toBeNull();
    });

    test('volta a sugerir quando o display-mode deixa de ser standalone', () => {
        browser.navigator.userAgent = `Mozilla/5.0 (iPhone) ${SAFARI}`;
        browser.displayMode.matches = true;
        initialize();
        expect(getInstallMode()).toBeNull();
        browser.displayMode.change(false);
        expect(getInstallMode()).toBe('ios');
    });

    test('mantém o card durante o prompt, evita cliques repetidos e oculta após aceitar', async () => {
        initialize();
        const choice = Promise.withResolvers<{ outcome: 'accepted' | 'dismissed' }>();
        const event = Object.assign(installEvent(), { userChoice: choice.promise });
        browser.dispatchEvent(event);
        const first = promptInstall();
        expect(getInstallMode()).toBe('native');
        await promptInstall();
        expect(event.prompt).toHaveBeenCalledTimes(1);
        choice.resolve({ outcome: 'accepted' });
        await first;
        expect(getInstallMode()).toBeNull();
        browser.dispatchEvent(installEvent());
        expect(getInstallMode()).toBeNull();
    });

    test('a recusa do usuário consome o evento e um novo evento reativa o card', async () => {
        initialize();
        const event = installEvent('dismissed');
        browser.dispatchEvent(event);
        await promptInstall();
        await promptInstall();
        expect(event.prompt).toHaveBeenCalledTimes(1);
        expect(getInstallMode()).toBeNull();
        browser.dispatchEvent(installEvent());
        expect(getInstallMode()).toBe('native');
    });

    test('trata a rejeição do prompt sem reutilizar o evento', async () => {
        initialize();
        const event = installEvent();
        event.prompt = mock(async () => {
            throw new Error('Falha no prompt');
        });
        browser.dispatchEvent(event);
        expect(await promptInstall()).toBeUndefined();
        await promptInstall();
        expect(event.prompt).toHaveBeenCalledTimes(1);
        expect(getInstallMode()).toBeNull();
        browser.dispatchEvent(installEvent());
        expect(getInstallMode()).toBe('native');
    });

    test('trata a rejeição da escolha do navegador', async () => {
        initialize();
        const event = Object.assign(installEvent(), {
            userChoice: Promise.reject(new Error('Falha na escolha'))
        });
        browser.dispatchEvent(event);
        expect(await promptInstall()).toBeUndefined();
        expect(getInstallMode()).toBeNull();
    });
});
