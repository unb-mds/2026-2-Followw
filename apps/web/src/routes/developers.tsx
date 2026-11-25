import type { OAuthClient } from '@followw/core/queries/oauth.ts';

import { useOnline } from '@followw/core/lib/online.ts';
import { loadQuery } from '@followw/core/queries/load.ts';
import { oauthClientsQueryOptions } from '@followw/core/queries/oauth.ts';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Navigate, redirect } from '@tanstack/react-router';
import { useState } from 'react';

import type { RevealedSecret } from '#/components/developers/use-client-actions';

import { ClientCard } from '#/components/developers/ClientCard';
import { ClientFormDialog } from '#/components/developers/ClientFormDialog';
import { ClientSecretDialog } from '#/components/developers/ClientSecretDialog';
import { DevelopersHeader } from '#/components/developers/DevelopersHeader';
import { EmptyClients } from '#/components/developers/EmptyClients';
import { useClientActions } from '#/components/developers/use-client-actions';
import { ErrorCard, ErrorState } from '#/components/ErrorState';
import { LoadingSkeleton } from '#/components/LoadingSkeleton';
import { Skeleton } from '#/components/ui/skeleton';
import { Toaster } from '#/components/ui/toast';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/developers')({
    head: () => ({ meta: [{ title: 'Portal de Desenvolvedores | Followw' }] }),
    loader: async ({ context: { queryClient } }) => {
        const user = await loadQuery(queryClient, meQueryOptions);
        if (!user) throw redirect({ to: '/login', search: { returnTo: '/developers' } });
        await loadQuery(queryClient, oauthClientsQueryOptions).catch(() => null);
    },
    errorComponent: ErrorState,
    component: DevelopersPage
});

function DevelopersPage() {
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const clients = useQuery(oauthClientsQueryOptions);
    const online = useOnline();

    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState<OAuthClient | null>(null);
    const [revealedSecret, setRevealedSecret] = useState<RevealedSecret | null>(null);
    const { create, update, rotate, remove, busy, error } = useClientActions(setRevealedSecret);

    if (!user) return <Navigate to="/login" search={{ returnTo: '/developers' }} replace />;

    const items = clients.data ?? [];

    return (
        <main className="min-h-dvh bg-background px-6 py-10 text-foreground">
            <div className="mx-auto flex max-w-3xl flex-col gap-8">
                <DevelopersHeader disabled={!online} onCreate={() => setCreateOpen(true)} />

                {error && (
                    <p
                        role="alert"
                        className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive"
                    >
                        {error}
                    </p>
                )}

                {clients.isLoadingError ? (
                    <ErrorCard
                        message="Não foi possível carregar suas aplicações."
                        onRetry={() => void clients.refetch()}
                    />
                ) : clients.isPending ? (
                    <LoadingSkeleton label="Carregando aplicações...">
                        <div className="flex flex-col gap-4">
                            <Skeleton className="h-36 w-full rounded-xl" />
                            <Skeleton className="h-36 w-full rounded-xl" />
                        </div>
                    </LoadingSkeleton>
                ) : items.length === 0 ? (
                    <EmptyClients disabled={!online} onCreate={() => setCreateOpen(true)} />
                ) : (
                    <section aria-label="Suas aplicações" className="flex flex-col gap-4">
                        {items.map((item) => (
                            <ClientCard
                                key={item.client_id}
                                client={item}
                                disabled={!online || busy(item.client_id)}
                                onEdit={() => setEditing(item)}
                                onRotateSecret={() => rotate.mutate(item.client_id)}
                                onDelete={() => remove.mutate(item.client_id)}
                            />
                        ))}
                    </section>
                )}

                {createOpen && (
                    <ClientFormDialog
                        mode="create"
                        open={createOpen}
                        onOpenChange={setCreateOpen}
                        onSubmit={async (body) => {
                            await create.mutateAsync(body);
                        }}
                    />
                )}

                {editing && (
                    <ClientFormDialog
                        key={editing.client_id}
                        mode="edit"
                        client={editing}
                        open
                        onOpenChange={(open) => !open && setEditing(null)}
                        onSubmit={async (body) => {
                            await update.mutateAsync({ clientId: editing.client_id, body });
                        }}
                    />
                )}

                {revealedSecret && (
                    <ClientSecretDialog
                        open
                        onOpenChange={(open) => !open && setRevealedSecret(null)}
                        {...revealedSecret}
                    />
                )}
            </div>
            <Toaster />
        </main>
    );
}
