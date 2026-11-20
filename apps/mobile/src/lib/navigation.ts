export const NAV_HREFS = ['/', '/turmas', '/ru', '/buscar', '/perfil'] as const;

// rotas com a barra; as demais (login, curso, privacidade, plano de ensino) ocupam a tela toda
const WITH_NAVIGATION = /^\/(turmas|ru|buscar|perfil|professores)?(\/|$)/;
const DOUBLE_TAP_MS = 400;

export function isDoubleTap(previous: number | null, now: number) {
    return previous !== null && now - previous < DOUBLE_TAP_MS;
}

export function activeNavIndex(pathname: string) {
    return NAV_HREFS.findIndex(
        (href) =>
            href === pathname ||
            ((href === '/turmas' || href === '/perfil') && pathname.startsWith(`${href}/`))
    );
}

export function showsNavigation(pathname: string) {
    return WITH_NAVIGATION.test(pathname) && !pathname.endsWith('/plano-de-ensino');
}
