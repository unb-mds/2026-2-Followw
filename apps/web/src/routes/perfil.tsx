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
    loader: ({ context }) => context.queryClient.query(meQueryOptions),
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

    const indexes = [
        { label: 'IRA', value: user.ira?.toFixed(4) },
        { label: 'MP', value: user.mp?.toFixed(4) }
    ].filter((index) => index.value !== undefined);

    return (
        <section className="px-1 pt-2">
            <div className="flex gap-4">
                {user.photo ? (
                    <img
                        src={user.photo}
                        alt=""
                        className="aspect-3/4 w-32 shrink-0 rounded-2xl object-cover shadow-lg ring-1 ring-white/80"
                    />
                ) : (
                    <div className="flex aspect-3/4 w-32 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-primary shadow-lg ring-1 ring-white/80">
                        <span className="material-symbols-outlined text-5xl">person</span>
                    </div>
                )}
                <div className="min-w-0 pb-1">
                    <h3 className="text-2xl leading-tight font-extrabold tracking-tight text-ink">
                        {user.name}
                    </h3>
                    <CopyRegistration registration={user.registration} />
                </div>
            </div>

            <div className="mt-6">
                <p className="text-base font-bold text-ink">{user.course}</p>
                <p className="text-sm text-muted">
                    {user.unity} • {user.level}
                </p>
            </div>

            {indexes.length > 0 && (
                <dl className="mt-6 flex divide-x divide-ink/10">
                    {indexes.map((index) => (
                        <div key={index.label} className="flex-1 px-4 first:pl-0">
                            <dt className="text-xs font-bold tracking-widest text-subtle uppercase">
                                {index.label}
                            </dt>
                            <dd className="text-3xl font-extrabold tracking-tight text-primary-dark tabular-nums">
                                {index.value}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}

            {user.integralization != null && (
                <div className="mt-6">
                    <div className="mb-2 flex items-baseline justify-between">
                        <span className="text-xs font-bold tracking-widest text-subtle uppercase">
                            Integralização
                        </span>
                        <span className="text-sm font-extrabold text-ink tabular-nums">
                            {user.integralization}%
                        </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-ink/10">
                        <div
                            className="h-full rounded-full bg-linear-to-r from-mint to-primary"
                            style={{ width: `${Math.min(user.integralization, 100)}%` }}
                        />
                    </div>
                </div>
            )}

            <button
                type="button"
                disabled={logout.isPending}
                onClick={() => logout.mutate({})}
                className="mt-10 flex cursor-pointer items-center gap-2 text-sm font-bold text-muted transition hover:text-primary-dark disabled:opacity-60"
            >
                <span className="material-symbols-outlined text-xl">logout</span>
                {logout.isPending ? 'Saindo...' : 'Sair'}
            </button>
        </section>
    );
}

function CopyRegistration({ registration }: { registration: string }) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        await navigator.clipboard.writeText(registration);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            type="button"
            onClick={copy}
            aria-label={copied ? 'Matrícula copiada' : 'Copiar matrícula'}
            className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white/60 py-0.5 pr-2 pl-2.5 text-xs font-bold tracking-wide text-primary-dark transition hover:bg-white active:scale-95"
        >
            {registration}
            <span className="material-symbols-outlined text-sm">
                {copied ? 'check' : 'content_copy'}
            </span>
        </button>
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
