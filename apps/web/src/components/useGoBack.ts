import { useCanGoBack, useRouter } from '@tanstack/react-router';

/** Volta no histórico quando há para onde, em vez de empilhar a mesma tela de novo. */
export function useGoBack() {
    const router = useRouter();
    const canGoBack = useCanGoBack();

    return (event: React.MouseEvent) => {
        if (!canGoBack) return;
        event.preventDefault();
        router.history.back();
    };
}
