import { localStorageRepository } from '#/lib/local-storage';

export type InstallMode = 'native' | 'ios' | null;

// Incrementar faz a sugestão reaparecer para quem já a dispensou.
const INSTALL_PROMPT_VERSION = 1;
const DISMISSED_KEY = 'install-dismissed';

interface InstallPromptEvent extends Event {
    prompt(): Promise<unknown>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface BrowserContext {
    window: Window;
    displayMode: MediaQueryList;
    iosSafari: boolean;
}

let context: BrowserContext | null = null;
let deferredPrompt: InstallPromptEvent | null = null;
let prompting = false;
let installed = false;
let dismissed = false;
let mode: InstallMode = null;
const listeners = new Set<() => void>();

function isInstallPrompt(event: Event): event is InstallPromptEvent {
    return 'prompt' in event && typeof event.prompt === 'function' && 'userChoice' in event;
}

function isIosSafari({ userAgent, platform, maxTouchPoints }: Navigator): boolean {
    const ios =
        /iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
    const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line\//.test(userAgent);
    return ios && /Safari/.test(userAgent) && !otherBrowser;
}

function isStandalone({ window, displayMode }: BrowserContext): boolean {
    const { navigator } = window;
    return displayMode.matches || ('standalone' in navigator && navigator.standalone === true);
}

function updateMode() {
    let next: InstallMode = null;
    if (context && !dismissed && !installed && !isStandalone(context)) {
        next = deferredPrompt || prompting ? 'native' : context.iosSafari ? 'ios' : null;
    }
    if (next === mode) return;
    mode = next;
    for (const listener of listeners) listener();
}

export function initializeInstallSupport(): () => void {
    if (typeof window === 'undefined') return () => {};
    const currentWindow = window;
    if (context?.window !== currentWindow) {
        deferredPrompt = null;
        prompting = false;
        installed = false;
        dismissed = false;
    }
    const displayMode = currentWindow.matchMedia('(display-mode: standalone)');
    context = {
        window: currentWindow,
        displayMode,
        iosSafari: isIosSafari(currentWindow.navigator)
    };
    dismissed ||=
        (localStorageRepository.get<number>(DISMISSED_KEY) ?? 0) >= INSTALL_PROMPT_VERSION;

    const onPrompt = (event: Event) => {
        event.preventDefault();
        if (installed || dismissed || !isInstallPrompt(event)) return;
        deferredPrompt = event;
        updateMode();
    };
    const onInstalled = () => {
        installed = true;
        deferredPrompt = null;
        updateMode();
    };
    currentWindow.addEventListener('beforeinstallprompt', onPrompt);
    currentWindow.addEventListener('appinstalled', onInstalled);
    displayMode.addEventListener('change', updateMode);
    updateMode();

    return () => {
        currentWindow.removeEventListener('beforeinstallprompt', onPrompt);
        currentWindow.removeEventListener('appinstalled', onInstalled);
        displayMode.removeEventListener('change', updateMode);
    };
}

export function subscribeInstallSupport(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getInstallMode(): InstallMode {
    return typeof window === 'undefined' ? null : mode;
}

export function dismissInstallCard(): void {
    dismissed = true;
    deferredPrompt = null;
    localStorageRepository.set(DISMISSED_KEY, INSTALL_PROMPT_VERSION);
    updateMode();
}

export async function promptInstall(): Promise<void> {
    const event = deferredPrompt;
    if (!event) return;
    // O evento só pode ser usado uma vez; após a recusa o navegador dispara um novo.
    deferredPrompt = null;
    prompting = true;
    try {
        const [, choice] = await Promise.all([event.prompt(), event.userChoice]);
        if (choice.outcome === 'accepted') installed = true;
    } catch {
        // Falha do navegador equivale a uma recusa.
    } finally {
        prompting = false;
        updateMode();
    }
}
