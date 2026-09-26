import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import React from 'react';

import { ApiError } from '#/queries/errors';
import { Card } from '#/components/ui/Card';
import { HeaderBar } from '#/components/ui/HeaderBar';

export const ErrorState: React.FC<ErrorComponentProps> = ({ error }) => {
    const router = useRouter();
    const message =
        error instanceof ApiError && error.isServerError
            ? 'O SIGAA não respondeu. Tente novamente em instantes.'
            : 'Erro inesperado ao carregar os dados.';

    return (
        <>
            <HeaderBar />
            <Card className="p-6 text-center">
                <span className="material-symbols-outlined text-3xl text-warning">
                    cloud_off
                </span>
                <p className="mt-2 text-sm font-semibold text-ink">{message}</p>
                <button
                    type="button"
                    onClick={() => router.invalidate()}
                    className="mt-4 cursor-pointer rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary-dark"
                >
                    Tentar novamente
                </button>
            </Card>
        </>
    );
};
