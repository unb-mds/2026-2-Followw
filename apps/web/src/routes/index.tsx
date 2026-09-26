import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { ApiError } from '../queries/errors.ts';
import { meQueryOptions } from '../queries/me.ts';

export const Route = createFileRoute('/')({
    loader: async ({ context }) => {
        await context.queryClient.ensureQueryData(meQueryOptions);
    },
    errorComponent: ({ error }) => {
        if (error instanceof ApiError && error.isUnauthorized) {
            return (
                <div className="bg-white p-8 text-black">
                    <h1 className="text-xl font-bold">Followw UnB</h1>
                    <p className="mt-4 text-sm text-amber-700">
                        Sessão não encontrada ou expirada. Faça login no SIGAA para continuar.
                    </p>
                </div>
            );
        }

        const message =
            error instanceof Error ? error.message : 'Erro inesperado ao consultar a API.';

        return (
            <div className="bg-white p-8 text-black">
                <h1 className="text-xl font-bold text-red-600">Erro ao carregar dados</h1>
                <p className="mt-4 text-sm text-gray-600">{message}</p>
            </div>
        );
    },
    component: Home
});

function Home() {
    const { data: user } = useSuspenseQuery(meQueryOptions);

    return (
        <div className="bg-white p-8 text-black">
            <h1 className="text-xl font-bold">Followw UnB</h1>
            <div className="mt-4">
                <p className="font-medium">Olá, {user.name}!</p>
                <p className="text-sm text-gray-600">Matrícula: {user.registration}</p>
                <p className="text-sm text-gray-600">Curso: {user.course}</p>
            </div>
        </div>
    );
}
