import type { components, operations } from '#/queries/schema.gen.ts';

import { api } from '#/queries/api.ts';

type MenuQuery = NonNullable<operations['get_menu_restaurant_menu_get']['parameters']['query']>;

export type Campus = NonNullable<MenuQuery['campus']>;
export type DailyMenu = components['schemas']['DailyMenu'];
export type MenuSection = components['schemas']['MenuSection'];

export const menuQueryOptions = (query: Pick<MenuQuery, 'campus' | 'date'>) =>
    api.queryOptions('get', '/restaurant/menu', { params: { query } });
