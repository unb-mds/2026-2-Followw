import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import type { components } from '#/queries/schema.gen';

import { Card } from '#/components/ui/Card';
import { ErrorState } from '#/components/ui/ErrorState';
import { HeaderBar } from '#/components/ui/HeaderBar';
import { useLogin, useLogout } from '#/queries/auth';
import { ApiError } from '#/queries/errors';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/perfil')({
    loader: ({ context }) => context.queryClient.ensureQueryData(meQueryOptions),
    errorComponent: ErrorState,
    component: PerfilPage
});

function PerfilPage() {
    const { data: user } = useSuspenseQuery(meQueryOptions);

    return (
        <>
            <HeaderBar />
            <div className="space-y-4">{user ? <Profile user={user} /> : <LoginForm />}</div>
        </>
    );
}

function Profile({ user }: { user: components['schemas']['UserProfile'] }) {
    const logout = useLogout();

    const stats = [
        { label: 'IRA', value: user.ira?.toFixed(4) },
        { label: 'MP', value: user.mp?.toFixed(4) },
        {
            label: 'Integralização',
            value: user.integralization == null ? undefined : `${user.integralization}%`
        }
    ].filter((stat) => stat.value !== undefined);

    return (
        <Card className="p-6">
            <div className="flex flex-col items-center text-center">
                {user.photo ? (
                    <img
                        src={user.photo}
                        alt=""
                        className="mb-3 h-16 w-16 rounded-full border border-line object-cover"
                    />
                ) : (
                    <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full border border-primary/20 bg-primary-light text-primary">
                        <span className="material-symbols-outlined text-3xl">person</span>
                    </div>
                )}
                <h3 className="text-lg font-bold text-ink">{user.name}</h3>
                <p className="text-xs text-muted">{user.registration}</p>
                <p className="mt-2 text-sm font-semibold text-ink">{user.course}</p>
                <p className="text-xs text-muted">
                    {user.unity} • {user.level}
                </p>
            </div>

            {stats.length > 0 && (
                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line/60 pt-4">
                    {stats.map((stat) => (
                        <div key={stat.label} className="text-center">
                            <p className="text-base font-extrabold text-primary-dark">
                                {stat.value}
                            </p>
                            <p className="text-xs font-semibold text-muted">{stat.label}</p>
                        </div>
                    ))}
                </div>
            )}

            <button
                type="button"
                disabled={logout.isPending}
                onClick={() => logout.mutate({})}
                className="mt-5 w-full cursor-pointer rounded-xl border border-line py-3 text-sm font-bold text-ink transition hover:border-primary hover:text-primary disabled:opacity-60"
            >
                {logout.isPending ? 'Saindo...' : 'Sair'}
            </button>
        </Card>
    );
}

function LoginForm() {
    const login = useLogin();
    const [registration, setRegistration] = useState('');
    const [password, setPassword] = useState('');

    const error =
        login.error instanceof ApiError && login.error.isUnauthorized
            ? 'Matrícula ou senha incorretas.'
            : login.error
              ? 'Não foi possível conectar ao SIGAA. Tente novamente.'
              : undefined;

    return (
        <Card className="p-6">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-primary/20 bg-primary-light text-primary">
                <span className="material-symbols-outlined text-3xl">person</span>
            </div>
            <h3 className="mb-1 text-center text-lg font-bold text-ink">Entrar no Followw</h3>
            <p className="mb-5 text-center text-xs text-muted">
                Utilize sua matrícula e senha do SIGAA. Sua sessão é protegida por cookies cifrados.
            </p>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    login.mutate({ body: { registration, password } });
                }}
                className="space-y-3"
            >
                <div>
                    <label htmlFor="registration" className="mb-1 block text-xs font-bold text-ink">
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
                        onChange={(e) => setRegistration(e.target.value)}
                        placeholder="251000000"
                        className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder-subtle transition focus:border-primary focus:outline-none"
                    />
                </div>

                <div>
                    <label htmlFor="password" className="mb-1 block text-xs font-bold text-ink">
                        Senha do SIGAA
                    </label>
                    <input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        minLength={6}
                        maxLength={64}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder-subtle transition focus:border-primary focus:outline-none"
                    />
                </div>

                {error && (
                    <p role="alert" className="text-xs font-semibold text-red-600">
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={login.isPending}
                    className="mt-2 w-full cursor-pointer rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-md transition hover:bg-primary-dark active:scale-95 disabled:opacity-60"
                >
                    {login.isPending ? 'Conectando...' : 'Conectar Conta'}
                </button>
            </form>
        </Card>
    );
}
