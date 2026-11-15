import { useNavigate } from '@tanstack/react-router';
import { useRef } from 'react';

const DOUBLE_TAP_MS = 400;

export function isDoubleTap(previous: number | null, now: number) {
    return previous !== null && now - previous < DOUBLE_TAP_MS;
}

export function useRestaurantShortcut(pathname: string) {
    const navigate = useNavigate();
    const previous = useRef<number | null>(null);

    return (event: React.MouseEvent) => {
        if (!isDoubleTap(previous.current, event.timeStamp)) {
            previous.current = event.timeStamp;
            return;
        }
        event.preventDefault();
        previous.current = null;
        void navigate({
            to: '/ru',
            search: (search) => (pathname === '/ru' ? search : {}),
            replace: true,
            state: { studentCard: true }
        });
    };
}
