import { CalendarDays } from 'lucide-react';

import { useDesktop } from '#/components/DesktopContext';
import { FloatingBar } from '#/components/FloatingBar';
import { Button } from '#/components/ui/button';

/** No mobile, atalho para voltar ao dia atual depois de escolher outro. */
export function BackToTodayBar({ open, onBack }: { open: boolean; onBack: () => void }) {
    const desktop = useDesktop();
    return (
        <FloatingBar open={open && !desktop} label="Dia selecionado">
            <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-primary"
                onClick={onBack}
            >
                <CalendarDays aria-hidden="true" />
                Voltar para hoje
            </Button>
        </FloatingBar>
    );
}
