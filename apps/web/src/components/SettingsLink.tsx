import { Link } from '@tanstack/react-router';
import { Settings } from 'lucide-react';

import { buttonVariants } from '#/components/ui/button';

export function SettingsLink() {
    return (
        <Link
            to="/configuracoes"
            aria-label="Configurações"
            className={buttonVariants({ variant: 'ghost', size: 'icon-lg' })}
        >
            <Settings className="size-5" aria-hidden="true" />
        </Link>
    );
}
