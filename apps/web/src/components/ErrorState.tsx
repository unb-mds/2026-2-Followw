import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { CloudOff } from 'lucide-react';

import { Button } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';
import { useFailureMessage } from '#/lib/online';
import { ApiError } from '#/queries/errors';

export const SIGAA_DOWN_MESSAGE = 'O SIGAA está com problemas. Tente novamente em instantes.';

interface ErrorCardProps {
    message: string;
    onRetry: () => void;
}

export const ErrorCard: React.FC<ErrorCardProps> = ({ message, onRetry }) => {
    const failureMessage = useFailureMessage(message);

    return (
        <Card className="text-center">
            <CardContent>
                <CloudOff className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-semibold">{failureMessage}</p>
                <Button type="button" onClick={onRetry} className="mt-4">
                    Tentar novamente
                </Button>
            </CardContent>
        </Card>
    );
};

export const ErrorState: React.FC<ErrorComponentProps> = ({ error }) => {
    const router = useRouter();
    const message =
        error instanceof ApiError && error.isServerError
            ? SIGAA_DOWN_MESSAGE
            : 'Erro inesperado ao carregar os dados.';

    return <ErrorCard message={message} onRetry={() => router.invalidate()} />;
};
