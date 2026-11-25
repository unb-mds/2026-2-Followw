import type { OAuthClientUpdate } from '@followw/core/queries/oauth.ts';

import { ApiError } from '@followw/core/queries/errors.ts';
import {
    createOAuthClient,
    updateOAuthClient,
    deleteOAuthClient,
    oauthClientsQueryOptions,
    rotateOAuthClientSecret
} from '@followw/core/queries/oauth.ts';
import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { toast } from '#/components/ui/toast';

const ACTION_KEY = ['oauth-client-action'];

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

    const create = useMutation({
        mutationFn: createOAuthClient,
        gcTime: 0,
        onSuccess: (created) => {
            if (created.client_secret)
                onSecret({
                    clientId: created.client_id,
                    clientSecret: created.client_secret,
                    title: 'Aplicação criada — salve seu client_secret'
                });
            void invalidate();
        }
    });
    const update = useMutation({
        mutationFn: ({ clientId, body }: { clientId: string; body: OAuthClientUpdate }) =>
            updateOAuthClient(clientId, body),
        onSuccess: () => {
            void invalidate();
        }
    });

    const rotate = useMutation({
        mutationKey: ACTION_KEY,
        mutationFn: rotateOAuthClientSecret,
        gcTime: 0,
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
        mutationKey: ACTION_KEY,
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

    // todas as ações pendentes, não só a última de cada mutation
    const pending = useMutationState({
        filters: { mutationKey: ACTION_KEY, status: 'pending' },
        select: (mutation) => mutation.state.variables
    });
    const busy = (id: string) => pending.includes(id);

    return { create, update, rotate, remove, busy, error };
}
