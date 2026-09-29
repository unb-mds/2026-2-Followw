import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { Check, Copy, LogOut, User } from 'lucide-react';
import { useState } from 'react';

import type { components } from '#/queries/schema.gen';

import { ErrorState } from '#/components/ui/ErrorState';
import { HeaderBar } from '#/components/ui/HeaderBar';
import { useLogout } from '#/queries/auth';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/perfil')({
    loader: async ({ context }) => {
        const user = await context.queryClient.query(meQueryOptions);
        if (!user) throw redirect({ to: '/login' });
        return user;
    },
    errorComponent: ErrorState,
    component: PerfilPage
});

function PerfilPage() {
    const { data: user } = useSuspenseQuery(meQueryOptions);

    return (
        <>
            <HeaderBar />
            {user && <Profile user={user} />}
        </>
    );
}

function Profile({ user }: { user: components['schemas']['UserProfile'] }) {
    const navigate = useNavigate();
    const logout = useLogout(() => void navigate({ to: '/login', replace: true }));

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
                        <User className="size-12" />
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
                <LogOut className="size-4" />
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
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
    );
}
