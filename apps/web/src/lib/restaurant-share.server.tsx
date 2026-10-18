import { restaurantSelection, validateRestaurantSearch } from '#/lib/restaurant-share';

export async function restaurantShareResponse(request: Request) {
    const search = validateRestaurantSearch(Object.fromEntries(new URL(request.url).searchParams));
    const selection = restaurantSelection(search);
    const [
        { ImageResponse },
        { RestaurantShareImage },
        { loadSharedMenu },
        { restaurantImageFonts }
    ] = await Promise.all([
        import('@vercel/og'),
        import('#/components/ru/RestaurantShareImage'),
        import('#/queries/restaurant-share'),
        import('#/lib/restaurant-image-fonts.server')
    ]);
    try {
        const sections = await loadSharedMenu(request, selection);
        const image = new ImageResponse(
            <RestaurantShareImage selection={selection} sections={sections} />,
            { width: 1200, height: 630, fonts: restaurantImageFonts }
        );
        // Consome a renderização antes de responder para não cachear uma falha do renderer.
        return new Response(await image.arrayBuffer(), {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control':
                    search.date && search.meal && search.campus
                        ? 'public, max-age=5400, s-maxage=5400'
                        : 'no-store'
            }
        });
    } catch (error) {
        console.error('Falha ao gerar a prévia pública do cardápio do RU:', error);
        return new Response('Não foi possível gerar a prévia do cardápio.', {
            status: 503,
            headers: { 'Cache-Control': 'no-store' }
        });
    }
}
