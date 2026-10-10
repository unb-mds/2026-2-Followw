import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/busca')({
    beforeLoad: () => {
        throw redirect({ to: '/buscar' });
    }
});
