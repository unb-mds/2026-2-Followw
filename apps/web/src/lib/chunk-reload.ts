const RELOAD_KEY = 'followw:chunk-reload';
const RELOAD_INTERVAL = 30_000;

/** Após um deploy, chunks antigos somem: recarrega a página uma vez para pegar o build novo. */
export function reloadOnPreloadError(
    target: {
        addEventListener: (type: string, fn: (event: Event) => void) => void;
        removeEventListener: (type: string, fn: (event: Event) => void) => void;
        location: { reload: () => void };
    } = window,
    storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage
) {
    const handler = (event: Event) => {
        const last = Number(storage.getItem(RELOAD_KEY) ?? 0);
        // já recarregou há pouco: deixa o erro seguir para a tela de erro, sem loop
        if (Date.now() - last < RELOAD_INTERVAL) return;
        event.preventDefault();
        storage.setItem(RELOAD_KEY, String(Date.now()));
        target.location.reload();
    };
    target.addEventListener('vite:preloadError', handler);
    return () => target.removeEventListener('vite:preloadError', handler);
}
