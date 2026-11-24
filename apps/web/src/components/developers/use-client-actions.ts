import { ApiError } from '@followw/core/queries/errors.ts';
import {
    deleteOAuthClient,
    oauthClientsQueryOptions,
    rotateOAuthClientSecret
} from '@followw/core/queries/oauth.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { toast } from '#/components/ui/toast';

export type RevealedSecret = { clientId: string; clientSecret: string; title: string };

function errorText(error: unknown, fallback: string) {
    return error instanceof ApiError && typeof error.detail === 'string' ? error.detail : fallback;
}

export function useClientActions(onSecret: (secret: RevealedSecret) => void) {
    const queryClient = useQueryClient();
    const [error, setError] = useState<string | null>(null);

    const invalidate = () =>
        queryClient.invalidateQueries({ queryKey: oauthClientsQueryOptions.queryKey });

    function fail(title: string, fallback: string) {
        return (cause: unknown) => {
            const description = errorText(cause, fallback);
            setError(description);
            toast.add({ type: 'error', title, description });
        };
    }

    const rotate = useMutation({
        mutationFn: rotateOAuthClientSecret,
        onMutate: () => setError(null),
        onSuccess: (result) => {
            onSecret({
                clientId: result.client_id,
                clientSecret: result.client_secret,
                title: 'Novo client_secret gerado'
            });
            void invalidate();
        },
        onError: fail(
            'Erro ao rotacionar segredo',
            'Não foi possível rotacionar o segredo. Tente novamente.'
        )
    });

    const remove = useMutation({
        mutationFn: deleteOAuthClient,
        onMutate: () => setError(null),
        onSuccess: () => {
            toast.add({ type: 'success', title: 'Aplicação excluída' });
            void invalidate();
        },
        onError: fail(
            'Erro ao excluir aplicação',
            'Não foi possível excluir a aplicação. Tente novamente.'
        )
    });

    return { rotate, remove, error, invalidate };
}
