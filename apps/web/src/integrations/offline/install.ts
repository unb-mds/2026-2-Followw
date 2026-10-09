import { localStorageRepository } from '#/lib/local-storage';

export type InstallMode = 'native' | 'ios' | null;

interface InstallPromptEvent extends Event {
    prompt(): Promise<unknown>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let browser: Window | null = null;
let displayMode: MediaQueryList | null = null;
let deferredPrompt: InstallPromptEvent | null = null;
let mode: InstallMode = null;
let ios = false;
let installed = false;
let dismissed = false;
const listeners = new Set<() => void>();

function isInstallPrompt(event: Event): event is InstallPromptEvent {
    return 'prompt' in event && typeof event.prompt === 'function' && 'userChoice' in event;
}

function updateMode() {
    const navigator = browser?.navigator;
    if (
        displayMode?.matches ||
        (navigator && 'standalone' in navigator && navigator.standalone === true)
    ) {
        installed = true;
        deferredPrompt = null;
    }
    const next = dismissed || installed ? null : deferredPrompt ? 'native' : ios ? 'ios' : null;
    if (next === mode) return;
    mode = next;
    for (const listener of listeners) listener();
}

export function initializeInstallSupport(): () => void {
    if (typeof window === 'undefined') return () => {};
    const currentBrowser = window;
    if (browser !== currentBrowser) {
        browser = currentBrowser;
        deferredPrompt = null;
        installed = false;
        dismissed = false;
    }
    const { userAgent, platform, maxTouchPoints } = currentBrowser.navigator;
    ios = /iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
    dismissed ||= localStorageRepository.get<boolean>('install-dismissed') === true;
    const currentDisplayMode = currentBrowser.matchMedia('(display-mode: standalone)');
    displayMode = currentDisplayMode;

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
    currentBrowser.addEventListener('beforeinstallprompt', onPrompt);
    currentBrowser.addEventListener('appinstalled', onInstalled);
    currentDisplayMode.addEventListener('change', updateMode);
    updateMode();

    return () => {
        currentBrowser.removeEventListener('beforeinstallprompt', onPrompt);
        currentBrowser.removeEventListener('appinstalled', onInstalled);
        currentDisplayMode.removeEventListener('change', updateMode);
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
    localStorageRepository.set('install-dismissed', true);
    updateMode();
}

export async function promptInstall(): Promise<void> {
    const event = deferredPrompt;
    if (!event || getInstallMode() !== 'native') return;
    deferredPrompt = null;
    updateMode();
    try {
        await Promise.all([event.prompt(), event.userChoice]);
    } catch {
        // O evento só pode ser usado uma vez, mesmo quando o navegador cancela ou falha.
    }
}
