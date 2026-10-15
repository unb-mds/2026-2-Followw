import { Link } from '@tanstack/react-router';
import { RefreshCw } from 'lucide-react';

import { FollowwLogo } from '#/components/FollowwLogo';
import { Button } from '#/components/ui/button';

export const CookiesBlockedPage: React.FC = () => (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center bg-background px-6 text-foreground">
        <div className="flex w-full max-w-sm flex-col items-center text-center">
            <FollowwLogo className="size-16 drop-shadow-xs" />
            <h1 className="mt-6 text-2xl font-bold tracking-tight">Cookies bloqueados</h1>
            <p className="mt-2 text-sm text-muted-foreground">
                Para entrar, o Followw precisa de cookies para manter seu acesso. Permita cookies
                para este site nas configurações do navegador e recarregue a página.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
                Se abriu por um link em outro app, tente abrir no navegador.
            </p>
            <Button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-6 w-full cursor-pointer gap-2"
                size="lg"
            >
                <RefreshCw className="size-4" />
                Recarregar página
            </Button>
            <Link
                to="/"
                className="mt-4 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
                Continuar sem entrar
            </Link>
        </div>
    </main>
);
