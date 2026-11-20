import { useNavigate } from '@tanstack/react-router';

/** Com a aba do RU já ativa, um novo clique nela abre a carteirinha. */
export function useRestaurantShortcut(pathname: string) {
    const navigate = useNavigate();

    return (event: React.MouseEvent) => {
        if (pathname !== '/ru') return;
        event.preventDefault();
        void navigate({
            to: '/ru',
            search: (search) => search,
            replace: true,
            state: { studentCard: true }
        });
    };
}
