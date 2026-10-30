import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { CloudOff } from 'lucide-react';

import { Button } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';
import { useFailureMessage } from '#/lib/online';
import { cn } from '#/lib/shadcn';
import { ApiError } from '#/queries/errors';

export const SIGAA_DOWN_MESSAGE = 'O SIGAA está com problemas. Tente novamente em instantes.';

interface ErrorCardProps {
    // sem conexão, dá lugar ao aviso de offline
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

interface StaleDataNoticeProps {
    // o que falhou, ex.: "as notícias"
    subject: string;
    className?: string;
}

// falha ao revalidar algo que ainda tem dado salvo para exibir
export const StaleDataNotice: React.FC<StaleDataNoticeProps> = ({ subject, className }) => (
    <output className={cn('block text-sm text-muted-foreground', className)}>
        Não foi possível atualizar {subject}. Exibindo os dados salvos.
    </output>
);

export const ErrorState: React.FC<ErrorComponentProps> = ({ error }) => {
    const router = useRouter();
    const message =
        error instanceof ApiError && error.isServerError
            ? SIGAA_DOWN_MESSAGE
            : 'Erro inesperado ao carregar os dados.';

    return <ErrorCard message={message} onRetry={() => router.invalidate()} />;
};
