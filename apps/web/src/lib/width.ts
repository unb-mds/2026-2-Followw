import { useLayoutEffect, useRef, useState } from 'react';

/** Largura do elemento; 0 até a primeira medição (inclusive no SSR). */
export function useWidth<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const [width, setWidth] = useState(0);
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return undefined;
        const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return { ref, width };
}
