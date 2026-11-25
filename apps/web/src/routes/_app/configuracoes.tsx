import { useOnline } from '@followw/core/lib/online.ts';
import { api } from '@followw/core/queries/api.ts';
import { loadQuery } from '@followw/core/queries/load.ts';
import { oauthGrantsQueryOptions } from '@followw/core/queries/oauth.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';

import { BackHeader } from '#/components/HeaderBar';
import { LoadingSkeleton, CardSkeleton } from '#/components/LoadingSkeleton';
import { ThemeToggle } from '#/components/ThemeToggle';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel
} from '#/components/ui/alert-dialog';
import { Button, buttonVariants } from '#/components/ui/button';
import { cn } from '#/lib/shadcn';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/_app/configuracoes')({
    loader: async ({ context, location }) => {
        const user = await loadQuery(context.queryClient, meQueryOptions);
        if (!user) throw redirect({ to: '/login', search: { returnTo: location.href } });
    },
    head: () => ({ meta: [{ title: 'Configurações | Followw' }] }),
    staticData: {
        header: () => <BackHeader to="/perfil" title="Configurações" />
    },
    component: SettingsPage
});

function SettingsPage() {
    const online = useOnline();
    const queryClient = useQueryClient();
    const grants = useQuery(oauthGrantsQueryOptions);
    const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
    const revoke = api.useMutation('delete', '/oauth/grants/{grant_id}', {
        onSuccess: (_data, variables) => {
            queryClient.setQueryData<typeof grants.data>(
                oauthGrantsQueryOptions.queryKey,
                (previous) =>
                    previous?.filter((grant) => grant.id !== variables.params.path.grant_id)
            );
            setSelected(null);
            void queryClient.invalidateQueries({ queryKey: oauthGrantsQueryOptions.queryKey });
        }
    });
    return (
        <div className="flex max-w-2xl flex-col gap-6 pb-6">
            <section className="flex items-center justify-between rounded-2xl border bg-card p-4">
                <div>
                    <h2 className="font-semibold">Aparência</h2>
                    <p className="text-sm text-muted-foreground">
                        Alternar entre sistema, claro e escuro.
                    </p>
                </div>
                <ThemeToggle />
            </section>
            {grants.isPending && online && (
                <LoadingSkeleton label="Carregando acessos autorizados">
                    <CardSkeleton />
                </LoadingSkeleton>
            )}
            {!!grants.data?.length && (
                <section className="flex flex-col gap-3">
                    <h2 className="font-semibold">Aplicativos autorizados</h2>
                    <p className="text-sm text-muted-foreground">
                        Cada item representa um acesso concedido. Revogar encerra esse acesso
                        imediatamente.
                    </p>
                    {(!online || grants.isError) && (
                        <div role="alert" className="flex flex-col gap-2 text-sm">
                            <p>
                                Não foi possível atualizar seus acessos. Tente novamente em
                                instantes.
                            </p>
                            <Button
                                variant="outline"
                                disabled={!online || grants.isFetching}
                                onClick={() => void grants.refetch()}
                            >
                                Tentar novamente
                            </Button>
                        </div>
                    )}
                    {grants.data.map((grant) => (
                        <article
                            key={grant.id}
                            className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center"
                        >
                            <div className="min-w-0 flex-1">
                                <h3 className="font-medium">
                                    {grant.client_name ?? 'Aplicativo indisponível'}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    Autorizado em{' '}
                                    {new Date(grant.created_at).toLocaleDateString('pt-BR')}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {grant.client_description}
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                disabled={!online}
                                onClick={() => {
                                    revoke.reset();
                                    setSelected({
                                        id: grant.id,
                                        name: grant.client_name ?? 'este aplicativo'
                                    });
                                }}
                            >
                                Revogar acesso
                            </Button>
                        </article>
                    ))}
                </section>
            )}
            <Link to="/developers" className={cn(buttonVariants({ variant: 'outline' }))}>
                Portal de desenvolvedores
            </Link>
            <AlertDialog
                open={selected !== null}
                onOpenChange={(open) => {
                    if (!open && !revoke.isPending) setSelected(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Revogar acesso de {selected?.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Este acesso deixará de funcionar. Para reconectar, será necessário
                            autorizar o aplicativo novamente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {revoke.isError && (
                        <p role="alert" className="text-sm text-destructive">
                            Não foi possível revogar. Tente novamente.
                        </p>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={revoke.isPending}>Cancelar</AlertDialogCancel>
                        <Button
                            variant="destructive"
                            disabled={revoke.isPending || !online}
                            onClick={() => {
                                if (selected)
                                    revoke.mutate({ params: { path: { grant_id: selected.id } } });
                            }}
                        >
                            {revoke.isPending ? 'Revogando…' : 'Revogar acesso'}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
