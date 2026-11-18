import type { DailyMenu } from '@followw/core/queries/restaurant.ts';

import type { RestaurantSelection } from '#/lib/restaurant-share';

import { ssrApiTarget } from '#/queries/ssr.ts';

// A prévia é pública: não encaminha cookies nem consulta dados da conta do RU.
export async function loadSharedMenu(request: Request, selection: RestaurantSelection) {
    const { clientIpHeaders } = await import('#/queries/client-ip.server');
    const { url, protocol } = ssrApiTarget('/api/public/restaurant', request);
    url.search = new URLSearchParams({
        campus: selection.campus,
        start_date: selection.date,
        end_date: selection.date
    }).toString();
    const headers = clientIpHeaders(request);
    if (protocol) headers.set('x-forwarded-proto', protocol);
    const response = await globalThis.fetch(url, {
        headers,
        signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error('O site do RU não respondeu.');
    const menus: DailyMenu[] = await response.json();
    return menus.find(({ date }) => date === selection.date)?.[selection.meal] ?? [];
}
