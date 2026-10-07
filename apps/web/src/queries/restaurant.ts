import type { QueryClient } from '@tanstack/react-query';

import type { components, operations } from '#/queries/schema.gen.ts';

import { weekDays } from '#/lib/schedule';
import { api } from '#/queries/api.ts';

type MenuQuery = NonNullable<operations['get_menu_public_restaurant_get']['parameters']['query']>;
type UserProfile = components['schemas']['UserProfile'];

export type Campus = NonNullable<MenuQuery['campus']>;
export type DailyMenu = components['schemas']['DailyMenu'];
export type MenuSection = components['schemas']['MenuSection'];

export const CAMPUS_LABELS: Record<Campus, string> = {
    Darcy: 'Darcy Ribeiro',
    Gama: 'Gama',
    Ceilandia: 'Ceilândia',
    Planaltina: 'Planaltina',
    Fazenda: 'Fazenda Água Limpa'
};

export function campusOf(unity?: string | null): Campus {
    switch (unity) {
        case 'FCTE':
            return 'Gama';
        case 'FCTS':
            return 'Ceilandia';
        case 'FUP':
            return 'Planaltina';
        default:
            return 'Darcy';
    }
}

// Sem campus explícito, usa o campus da unidade do usuário logado.
export const menuQueryOptions = ({
    campus,
    date,
    user
}: Pick<MenuQuery, 'campus' | 'date'> & { user?: Pick<UserProfile, 'unity'> | null }) =>
    api.queryOptions('get', '/public/restaurant', {
        params: { query: { campus: campus ?? campusOf(user?.unity), date } }
    });

export async function prefetchWeekMenus(queryClient: QueryClient, campus: Campus, today: string) {
    const dates = weekDays(today).map((day) => day.date);
    // não busca de novo se já há cardápio salvo da semana
    const saved = dates.some(
        (date) =>
            queryClient.getQueryData(menuQueryOptions({ campus, date }).queryKey) !== undefined
    );
    if (saved) return;
    const menus = await queryClient.query({
        ...api.queryOptions('get', '/public/restaurant', {
            params: { query: { campus, start_date: dates[0], end_date: dates.at(-1) } }
        }),
        // a faixa só serve para preencher os dias; não fica (nem é persistida) no cache
        gcTime: 0
    });
    for (const menu of menus ?? [])
        queryClient.setQueryData(menuQueryOptions({ campus, date: menu.date }).queryKey, [menu]);
}
