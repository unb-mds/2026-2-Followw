import { noop } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 64;
const MAX_PULL = 96;

interface PullToRefreshProps {
    onRefresh: () => Promise<unknown>;
    disabled?: boolean;
    children: React.ReactNode;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, disabled, children }) => {
    const [pull, setPull] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const start = useRef<number | null>(null);

    useEffect(() => {
        const root = document.documentElement;
        root.style.overscrollBehaviorY = disabled ? '' : 'contain';
        return () => {
            root.style.overscrollBehaviorY = '';
        };
    }, [disabled]);

    const onTouchStart = (event: React.TouchEvent) => {
        if (disabled || refreshing || window.scrollY > 0) return;
        start.current = event.touches[0].clientY;
        setDragging(true);
    };

    const onTouchMove = (event: React.TouchEvent) => {
        if (start.current === null) return;
        const distance = event.touches[0].clientY - start.current;
        setPull(Math.min(Math.max(distance / 2, 0), MAX_PULL));
    };

    const onTouchEnd = async () => {
        if (start.current === null) return;
        start.current = null;
        setDragging(false);
        if (pull < THRESHOLD) {
            setPull(0);
            return;
        }
        setPull(THRESHOLD);
        setRefreshing(true);
        await onRefresh().catch(noop);
        setRefreshing(false);
        setPull(0);
    };

    return (
        <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
        >
            <output
                className="flex items-center justify-center overflow-hidden text-primary-dark"
                style={{ height: pull, transition: dragging ? 'none' : 'height 200ms ease-out' }}
            >
                <RefreshCw
                    aria-hidden="true"
                    className={refreshing ? 'size-5 animate-spin' : 'size-5'}
                    style={{
                        opacity: Math.min(pull / THRESHOLD, 1),
                        transform: refreshing ? undefined : `rotate(${pull * 3}deg)`
                    }}
                />
                {refreshing && <span className="sr-only">Atualizando</span>}
            </output>
            {children}
        </div>
    );
};
