import type { ErrorComponentProps } from '@tanstack/react-router';

import { RefreshCw } from 'lucide-react';

import { FollowwLogo } from '#/components/FollowwLogo';
import { Button } from '#/components/ui/button';
import { ApiError } from '#/queries/errors';

export interface ErrorPageProps extends Partial<ErrorComponentProps> {
    message?: string;
    onRetry?: () => void;
}

export const ErrorPage: React.FC<ErrorPageProps> = ({ error, reset, message, onRetry }) => {
    const handleRetry = () => {
        if (onRetry) {
            onRetry();
            return;
        }
        reset?.();
        if (typeof window !== 'undefined') {
            window.location.reload();
        }
    };

    const resolvedMessage =
        message ??
        (error instanceof ApiError && error.isServerError
            ? 'O SIGAA ou nossos servidores estão com problemas. Tente novamente em instantes.'
            : 'Não foi possível carregar as informações. Verifique sua conexão e tente novamente.');

    return (
        <main className="flex min-h-dvh w-full flex-col items-center justify-center bg-background px-6 text-foreground">
            <div className="flex w-full max-w-sm flex-col items-center text-center">
                <FollowwLogo className="size-16 drop-shadow-xs" />
                <h1 className="mt-6 text-2xl font-bold tracking-tight">
                    Estamos com problemas no momento
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">{resolvedMessage}</p>
                <Button
                    type="button"
                    onClick={handleRetry}
                    className="mt-6 w-full cursor-pointer gap-2"
                    size="lg"
                >
                    <RefreshCw className="size-4" />
                    Tentar novamente
                </Button>
                <a
                    href="/"
                    className="mt-4 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                    Voltar ao início
                </a>
            </div>
        </main>
    );
};
