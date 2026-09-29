import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { LoginPrivacyInfo } from '#/components/auth/LoginPrivacyInfo';
import { LoginSubmitButton } from '#/components/auth/LoginSubmitButton';
import { ErrorState } from '#/components/ui/ErrorState';
import { FollowwLogo } from '#/components/ui/FollowwLogo';
import { useLogin } from '#/queries/auth';
import { ApiError } from '#/queries/errors';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/login')({
    loader: async ({ context }) => {
        try {
            const user = await context.queryClient.query(meQueryOptions);
            if (user) throw redirect({ to: '/' });
        } catch (error) {
            if (error instanceof ApiError || error instanceof TypeError) return;
            throw error;
        }
    },
    errorComponent: ErrorState,
    component: LoginPage
});

function LoginPage() {
    const navigate = useNavigate();
    const login = useLogin();
    const [registration, setRegistration] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const error =
        login.error instanceof ApiError && login.error.isUnauthorized
            ? 'Matrícula ou senha incorretas.'
            : login.error
              ? 'Não foi possível conectar ao SIGAA. Tente novamente.'
              : undefined;

    return (
        <main className="login-page flex min-h-dvh w-full max-w-110 flex-col items-center shadow-2xl">
            <div className="login-content flex w-full flex-col items-center px-10 pt-42">
                <header className="flex flex-col items-center text-center">
                    <FollowwLogo className="h-auto w-20 drop-shadow-sm" />
                    <h1 className="mt-2 text-3xl leading-tight font-extrabold tracking-tight text-ink">
                        Followw
                    </h1>
                    <p className="text-xs text-login-muted">Universidade de Brasília</p>
                </header>

                <form
                    className="mt-11 w-full max-w-90"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (login.isPending) return;
                        login.mutate(
                            { body: { registration, password } },
                            { onSuccess: () => void navigate({ to: '/', replace: true }) }
                        );
                    }}
                >
                    <label htmlFor="registration" className="sr-only">
                        Matrícula
                    </label>
                    <input
                        id="registration"
                        type="text"
                        inputMode="numeric"
                        autoComplete="username"
                        required
                        pattern="\d{9}"
                        maxLength={9}
                        value={registration}
                        onChange={(event) => setRegistration(event.target.value)}
                        placeholder="Matrícula"
                        className="h-12 w-full rounded-2xl border border-login-border bg-white/90 px-4 text-sm text-ink shadow-sm outline-none placeholder:text-login-muted focus:border-login-blue focus:ring-2 focus:ring-login-blue/15"
                    />

                    <div className="relative mt-3">
                        <label htmlFor="password" className="sr-only">
                            Senha do SIGAA
                        </label>
                        <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            required
                            minLength={6}
                            maxLength={64}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Senha do SIGAA"
                            className="h-12 w-full rounded-2xl border border-login-border bg-white/90 py-2 pr-12 pl-4 text-sm text-ink shadow-sm outline-none placeholder:text-login-muted focus:border-login-blue focus:ring-2 focus:ring-login-blue/15"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((visible) => !visible)}
                            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                            aria-controls="password"
                            className="absolute inset-y-0 right-0 flex w-12 cursor-pointer items-center justify-center rounded-r-2xl text-login-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-login-blue"
                        >
                            {showPassword ? (
                                <EyeOff className="size-5" aria-hidden="true" />
                            ) : (
                                <Eye className="size-5" aria-hidden="true" />
                            )}
                        </button>
                    </div>

                    {error && (
                        <p
                            role="alert"
                            className="mt-3 text-center text-xs font-semibold text-red-600"
                        >
                            {error}
                        </p>
                    )}

                    <LoginSubmitButton pending={login.isPending} />
                </form>

                <Link
                    to="/"
                    className="mt-5 text-center text-xs font-semibold text-login-blue hover:underline"
                >
                    Continuar sem entrar
                </Link>

                <LoginPrivacyInfo />
            </div>
        </main>
    );
}
