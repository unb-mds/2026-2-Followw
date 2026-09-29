import { createFileRoute, redirect } from '@tanstack/react-router';

// 404
export const Route = createFileRoute('/$')({
    beforeLoad: () => {
        throw redirect({ to: '/' });
    }
});
