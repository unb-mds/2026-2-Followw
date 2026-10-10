import type { QueryClient } from '@tanstack/react-query';

import type { components, operations } from '#/queries/schema.gen.ts';

import { nextDays } from '#/lib/schedule';
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

// Uma query por campus e semana; `date` só seleciona o dia dela.
// Sem campus explícito, usa o campus da unidade do usuário logado.
export const menuQueryOptions = ({
    campus,
    date,
    user
}: Pick<MenuQuery, 'campus'> & {
    date: string;
    user?: Pick<UserProfile, 'unity'> | null;
}) => {
    // segunda a domingo, a mesma semana que a API devolve sem filtro
    const monday = new Date(`${date}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const week = nextDays(monday.toISOString().slice(0, 10), 7);
    return {
        ...api.queryOptions('get', '/public/restaurant', {
            params: {
                query: {
                    campus: campus ?? campusOf(user?.unity),
                    start_date: week[0].date,
                    end_date: week[6].date
                }
            }
        }),
        select: (menus: DailyMenu[]) => menus.filter((menu) => menu.date === date)
    };
};

export async function prefetchWeekMenus(queryClient: QueryClient, campus: Campus, today: string) {
    const options = menuQueryOptions({ campus, date: today });
    // não busca de novo se já há cardápio salvo da semana
    if (queryClient.getQueryData(options.queryKey) !== undefined) return;
    await queryClient.query(options);
}
