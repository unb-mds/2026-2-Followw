import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/share/ru.png')({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const { restaurantShareResponse } = await import('#/lib/restaurant-share.server');
                return restaurantShareResponse(request);
            }
        }
    }
});
