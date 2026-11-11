import { localStorageRepository, STORAGE_PREFIX } from '#/lib/local-storage';

const SESSION_KEY = 'offline-session';
export const OFFLINE_SESSION_STORAGE_KEY = `${STORAGE_PREFIX}${SESSION_KEY}`;

export interface OfflineSession {
    id: string;
    registration: string | null;
}

let tabSession: OfflineSession | undefined;
export const readOfflineSession = () => localStorageRepository.get<OfflineSession>(SESSION_KEY);

export function changeOfflineSession(registration: string | null) {
    const session = { id: crypto.randomUUID(), registration };
    if (typeof window === 'undefined') return session;
    tabSession = session;
    localStorageRepository.set(SESSION_KEY, tabSession);
    return session;
}

export function bindOfflineSession(registration: string) {
    const session = readOfflineSession() ?? changeOfflineSession(registration);
    if (session.registration !== registration) return undefined;
    tabSession = session;
    return session;
}

export function isCurrentOfflineSession(session = tabSession) {
    return session !== undefined && readOfflineSession()?.id === session.id;
}

export function isSupersededOfflineSession() {
    const current = readOfflineSession();
    return Boolean(tabSession && current && current.id !== tabSession.id);
}

export function matchesOfflineAccount(registration: string) {
    const session = readOfflineSession();
    return !session || session.registration === registration;
}
