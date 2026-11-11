import type { QueryClient } from '@tanstack/react-query';

import type { components, operations } from '#/queries/schema.gen.ts';

import { restaurantWeek } from '#/lib/restaurant';
import { api } from '#/queries/api.ts';

type MenuQuery = NonNullable<operations['get_menu_public_restaurant_get']['parameters']['query']>;
type UserProfile = components['schemas']['UserProfile'];

export type Campus = NonNullable<MenuQuery['campus']>;
export type DailyMenu = components['schemas']['DailyMenu'];
export type MenuSection = components['schemas']['MenuSection'];

export const CAMPUS_OPTIONS = [
    'Darcy',
    'Gama',
    'Ceilandia',
    'Planaltina',
    'Fazenda'
] as const satisfies readonly Campus[];

export const CAMPUS_LABELS: Record<Campus, string> = {
    Darcy: 'Darcy Ribeiro',
    Gama: 'Gama',
    Ceilandia: 'Ceilândia',
    Planaltina: 'Planaltina',
    Fazenda: 'Fazenda Água Limpa'
};

export function campusOf(unit?: string | null): Campus {
    switch (unit) {
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

// Uma query por campus e semana; `date` só seleciona o dia dela.
// Sem campus explícito, usa o campus da unidade do usuário logado.
export const menuQueryOptions = ({
    campus,
    date,
    user
}: Pick<MenuQuery, 'campus'> & {
    date: string;
    user?: Pick<UserProfile, 'unit'> | null;
}) => {
    const week = restaurantWeek(date);
    return {
        ...api.queryOptions('get', '/public/restaurant', {
            params: {
                query: {
                    campus: campus ?? campusOf(user?.unit?.code),
                    start_date: week[0].date,
                    end_date: week[week.length - 1].date
                }
            }
        }),
        select: (menus: DailyMenu[]) => menus.filter((menu) => menu.date === date)
    };
};

export function prefetchWeekMenus(queryClient: QueryClient, campus: Campus, today: string) {
    // 'static' reaproveita o cardápio salvo da semana, sem buscar de novo
    return queryClient.query({ ...menuQueryOptions({ campus, date: today }), staleTime: 'static' });
}
