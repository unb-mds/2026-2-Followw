import type { RestaurantSelection } from '@followw/core/lib/restaurant.ts';
import type { DailyMenu } from '@followw/core/queries/restaurant.ts';

// A prévia é pública: não encaminha cookies nem consulta dados da conta do RU.
export async function loadSharedMenu(request: Request, selection: RestaurantSelection) {
    const { clientIpHeaders } = await import('#/queries/client-ip.server');
    const url = new URL('/api/public/restaurant', request.url);
    url.search = new URLSearchParams({
        campus: selection.campus,
        start_date: selection.date,
        end_date: selection.date
    }).toString();
    const response = await globalThis.fetch(url, {
        headers: clientIpHeaders(request),
        signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error('O site do RU não respondeu.');
    const menus: DailyMenu[] = await response.json();
    return menus.find(({ date }) => date === selection.date)?.[selection.meal] ?? [];
}
