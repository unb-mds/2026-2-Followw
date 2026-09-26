import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';

import { ApiError } from '#/queries/errors';
import { Card } from '#/components/ui/Card';
import { HeaderBar } from '#/components/ui/HeaderBar';

export const SIGAA_DOWN_MESSAGE = 'O SIGAA está com problemas. Tente novamente em instantes.';

interface ErrorCardProps {
    message: string;
    onRetry: () => void;
}

export const ErrorCard: React.FC<ErrorCardProps> = ({ message, onRetry }) => (
    <Card className="p-6 text-center">
        <span className="material-symbols-outlined text-3xl text-warning">cloud_off</span>
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

    return (
        <>
            <HeaderBar />
            <ErrorCard message={message} onRetry={() => router.invalidate()} />
        </>
    );
};
