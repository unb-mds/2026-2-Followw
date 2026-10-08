import { createFileRoute, notFound, redirect } from '@tanstack/react-router';

// 404
export const Route = createFileRoute('/$')({
    beforeLoad: ({ location }) => {
        // asset ausente deve dar 404 de verdade: redirecionar para o HTML quebra o import do módulo
        if (location.pathname.startsWith('/assets/')) throw notFound();
        throw redirect({ to: '/' });
    }
});
