import type { components, operations } from '#/queries/schema.gen.ts';

import { api } from '#/queries/api.ts';

type MenuQuery = NonNullable<operations['get_menu_restaurant_menu_get']['parameters']['query']>;
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
    api.queryOptions('get', '/restaurant/menu', {
        params: { query: { campus: campus ?? campusOf(user?.unity), date } }
    });
