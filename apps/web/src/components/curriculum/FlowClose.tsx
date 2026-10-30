import { useLocation, useNavigate } from '@tanstack/react-router';
import { X } from 'lucide-react';

import { Button } from '#/components/ui/button';
import { searchDestination, validateFlowSearch } from '#/lib/curriculum/navigation';

export function FlowClose() {
    const navigate = useNavigate();
    const location = useLocation();
    async function close() {
        const scroll = location.state.flowReturnScroll;
        await navigate({
            ...searchDestination(validateFlowSearch(location.search)),
            resetScroll: false
        });
        requestAnimationFrame(() =>
            window.scrollTo({
                top: typeof scroll === 'number' && Number.isFinite(scroll) ? Math.max(0, scroll) : 0
            })
        );
    }
    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={() => void close()}
            aria-label="Fechar fluxo acadêmico"
            className="shrink-0"
        >
            <X className="size-5" aria-hidden="true" />
        </Button>
    );
}
