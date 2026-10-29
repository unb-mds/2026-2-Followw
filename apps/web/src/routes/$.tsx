import { createFileRoute, notFound, rootRouteId } from '@tanstack/react-router';

export const Route = createFileRoute('/$')({
    beforeLoad: () => {
        throw notFound({ routeId: rootRouteId });
    }
});
