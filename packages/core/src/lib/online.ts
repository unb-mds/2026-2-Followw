import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

export const OFFLINE_MESSAGE = 'Você está sem conexão com a internet.';

export function useOnline() {
    return useSyncExternalStore(
        (callback) => onlineManager.subscribe(callback),
        () => onlineManager.isOnline(),
        () => true
    );
}

/** Offline a falha é da conexão, não de quem deveria responder. */
export function useFailureMessage(message: string) {
    return useOnline() ? message : OFFLINE_MESSAGE;
}
