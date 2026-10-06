import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { Check, Copy, LogOut, User } from 'lucide-react';
import { useState } from 'react';

import type { components } from '#/queries/schema.gen';

import { ErrorState } from '#/components/ErrorState';
import { PullToRefresh } from '#/components/PullToRefresh';
import { Button } from '#/components/ui/button';
import { Progress } from '#/components/ui/progress';
import { useLogout } from '#/queries/auth';
import { meQueryOptions } from '#/queries/me';
import { refreshQuery } from '#/queries/refresh';

export const Route = createFileRoute('/_app/perfil')({
    loader: async ({ context }) => {
        const user = await context.queryClient.query(meQueryOptions);
        if (!user) throw redirect({ to: '/login' });
        return user;
    },
    errorComponent: ErrorState,
    component: PerfilPage
});

function PerfilPage() {
    const queryClient = useQueryClient();
    const { data: user } = useSuspenseQuery(meQueryOptions);

    return (
        <PullToRefresh onRefresh={() => refreshQuery(queryClient, meQueryOptions)}>
            {user && <Profile user={user} />}
        </PullToRefresh>
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
                        className="aspect-3/4 w-32 shrink-0 rounded-2xl object-cover shadow-lg ring-1 ring-border"
                    />
                ) : (
                    <div className="flex aspect-3/4 w-32 shrink-0 items-center justify-center rounded-2xl bg-card text-primary shadow-lg ring-1 ring-border">
                        <User className="size-12" />
                    </div>
                )}
                <div className="min-w-0 pb-1">
                    <h3 className="text-2xl leading-tight font-extrabold tracking-tight text-foreground">
                        {user.name}
                    </h3>
                    <CopyRegistration registration={user.registration} />
                </div>
            </div>

            <div className="mt-6">
                <p className="text-base font-bold text-foreground">{user.course}</p>
                <p className="text-sm text-muted-foreground">
                    {user.unity} • {user.level}
                </p>
            </div>

            {indexes.length > 0 && (
                <dl className="mt-6 flex divide-x divide-border">
                    {indexes.map((index) => (
                        <div key={index.label} className="flex-1 px-4 first:pl-0">
                            <dt className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                                {index.label}
                            </dt>
                            <dd className="text-3xl font-extrabold tracking-tight text-primary tabular-nums">
                                {index.value}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}

            {user.integralization != null && (
                <div className="mt-6">
                    <div className="mb-2 flex items-baseline justify-between">
                        <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                            Integralização
                        </span>
                        <span className="text-sm font-extrabold text-foreground tabular-nums">
                            {user.integralization}%
                        </span>
                    </div>
                    <Progress
                        value={Math.min(user.integralization, 100)}
                        aria-label="Integralização"
                    />
                </div>
            )}

            <Button
                variant="ghost"
                disabled={logout.isPending}
                onClick={() => logout.mutate({})}
                className="mt-10 text-muted-foreground"
            >
                <LogOut className="size-4" />
                {logout.isPending ? 'Saindo...' : 'Sair'}
            </Button>
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
        <Button
            variant="secondary"
            size="xs"
            onClick={copy}
            aria-label={copied ? 'Matrícula copiada' : 'Copiar matrícula'}
            className="mt-2 rounded-full tracking-wide"
        >
            {registration}
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
    );
}
