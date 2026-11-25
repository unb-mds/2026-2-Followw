import { Navigate, useLocation } from '@tanstack/react-router';

/** Sessão encerrada na página: vai ao login e volta para cá. */
export function LoginRedirect() {
    const { href } = useLocation();
    return <Navigate to="/login" search={{ returnTo: href }} replace />;
}
