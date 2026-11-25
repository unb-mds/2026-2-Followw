import { Redirect, usePathname } from 'expo-router';

/** Sessão encerrada na tela: vai ao login e volta para cá. */
export function LoginRedirect() {
    const pathname = usePathname();
    return <Redirect href={{ pathname: '/login', params: { returnTo: pathname } }} />;
}
