export const NAV_HREFS = ['/', '/turmas', '/ru', '/buscar', '/perfil'] as const;

// rotas com a barra; as demais (login, curso, plano de ensino) ocupam a tela toda
const WITH_NAVIGATION = /^\/(turmas|ru|buscar|perfil|professores|configuracoes)?(\/|$)/;
export function activeNavIndex(pathname: string) {
    return NAV_HREFS.findIndex(
        (href) =>
            href === pathname ||
            ((href === '/turmas' || href === '/perfil') && pathname.startsWith(`${href}/`)) ||
            (href === '/perfil' && pathname === '/configuracoes')
    );
}

export function showsNavigation(pathname: string) {
    return WITH_NAVIGATION.test(pathname) && !pathname.endsWith('/plano-de-ensino');
}

/** Com a aba do RU já ativa, um novo toque nela abre a carteirinha. */
export function restaurantTabHref(pathname: string) {
    return pathname === '/ru'
        ? ({ pathname: '/ru', params: { carteirinha: '1' } } as const)
        : '/ru';
}
