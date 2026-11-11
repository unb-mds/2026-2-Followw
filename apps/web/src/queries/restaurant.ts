import { useQuery, type QueryClient } from '@tanstack/react-query';

import type { Day } from '#/lib/schedule';
import type { components, operations } from '#/queries/schema.gen.ts';

import { upcomingMenuMeals } from '#/lib/restaurant';
import { addDays, nextDays, weekDays } from '#/lib/schedule';
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

// Uma query por campus e semana; a consulta diária só seleciona o dia dela.
// Sem campus explícito, usa o campus da unidade do usuário logado.
export const weeklyMenuQueryOptions = ({
    campus,
    date,
    user
}: Pick<MenuQuery, 'campus'> & {
    date: string;
    user?: Pick<UserProfile, 'unit'> | null;
}) => {
    // segunda a domingo, a mesma semana que a API devolve sem filtro
    const monday = new Date(`${date}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const week = nextDays(monday.toISOString().slice(0, 10), 7);
    return api.queryOptions('get', '/public/restaurant', {
        params: {
            query: {
                campus: campus ?? campusOf(user?.unit?.code),
                start_date: week[0].date,
                end_date: week[6].date
            }
        }
    });
};

export const menuQueryOptions = (options: Parameters<typeof weeklyMenuQueryOptions>[0]) => ({
    ...weeklyMenuQueryOptions(options),
    select: (menus: DailyMenu[]) => menus.filter((menu) => menu.date === options.date)
});

export function useMenuPreview({
    campus,
    date,
    now,
    upcoming
}: {
    campus: Campus;
    date: string;
    now: Day & { time: string };
    upcoming: boolean;
}) {
    const current = useQuery(weeklyMenuQueryOptions({ campus, date }));
    const needsNextWeek =
        upcoming && current.data != null && upcomingMenuMeals(current.data, date, now).length < 2;
    const nextMonday = addDays(weekDays(date, 7)[0].date, 7);
    const next = useQuery({
        ...weeklyMenuQueryOptions({ campus, date: nextMonday }),
        enabled: needsNextWeek
    });
    return {
        menus: [...(current.data ?? []), ...(needsNextWeek ? (next.data ?? []) : [])],
        isLoading: current.isPending || (needsNextWeek && next.isPending)
    };
}

export function prefetchWeekMenus(queryClient: QueryClient, campus: Campus, today: string) {
    // 'static' reaproveita o cardápio salvo da semana, sem buscar de novo
    return queryClient.query({ ...menuQueryOptions({ campus, date: today }), staleTime: 'static' });
}
