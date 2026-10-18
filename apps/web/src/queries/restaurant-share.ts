import type { RestaurantSelection } from '#/lib/restaurant-share';
import type { DailyMenu } from '#/queries/restaurant';

// A prévia é pública: não encaminha cookies nem consulta dados da conta do RU.
export async function loadSharedMenu(request: Request, selection: RestaurantSelection) {
    const url = new URL('/api/public/restaurant', request.url);
    url.search = new URLSearchParams({
        campus: selection.campus,
        start_date: selection.date,
        end_date: selection.date
    }).toString();
    const response = await globalThis.fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('O site do RU não respondeu.');
    const menus: DailyMenu[] = await response.json();
    return menus.find(({ date }) => date === selection.date)?.[selection.meal] ?? [];
}
