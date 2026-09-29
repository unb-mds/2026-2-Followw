import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { CloudOff } from 'lucide-react';

import { ApiError } from '#/queries/errors';
import { Card } from '#/components/ui/Card';

export const SIGAA_DOWN_MESSAGE = 'O SIGAA está com problemas. Tente novamente em instantes.';

interface ErrorCardProps {
    message: string;
    onRetry: () => void;
}

export const ErrorCard: React.FC<ErrorCardProps> = ({ message, onRetry }) => (
    <Card className="p-6 text-center">
        <CloudOff className="mx-auto size-8 text-warning" />
        <p className="mt-2 text-sm font-semibold text-ink">{message}</p>
        <button
            type="button"
            onClick={onRetry}
            className="mt-4 cursor-pointer rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary-dark"
        >
            Tentar novamente
        </button>
    </Card>
);

export const ErrorState: React.FC<ErrorComponentProps> = ({ error }) => {
    const router = useRouter();
    const message =
        error instanceof ApiError && error.isServerError
            ? SIGAA_DOWN_MESSAGE
            : 'Erro inesperado ao carregar os dados.';

    return <ErrorCard message={message} onRetry={() => router.invalidate()} />;
};
