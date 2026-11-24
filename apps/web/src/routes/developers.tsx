import type { OAuthClient } from '@followw/core/queries/oauth.ts';

import { useOnline } from '@followw/core/lib/online.ts';
import { loadQuery } from '@followw/core/queries/load.ts';
import {
    createOAuthClient,
    deleteOAuthClient,
    oauthClientsQueryOptions,
    rotateOAuthClientSecret,
    updateOAuthClient
} from '@followw/core/queries/oauth.ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, Navigate, redirect } from '@tanstack/react-router';
import {
    ArrowLeft,
    BookOpen,
    Check,
    Code2,
    Copy,
    ExternalLink,
    KeyRound,
    Pencil,
    Plus,
    Trash2
} from 'lucide-react';
import { useState } from 'react';

import { ClientFormDialog } from '#/components/developers/ClientFormDialog';
import { ClientSecretDialog } from '#/components/developers/ClientSecretDialog';
import { ErrorCard, ErrorState } from '#/components/ErrorState';
import { FollowwLogo } from '#/components/FollowwLogo';
import { LoadingSkeleton } from '#/components/LoadingSkeleton';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from '#/components/ui/alert-dialog';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';
import { Skeleton } from '#/components/ui/skeleton';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/developers')({
    head: () => ({ meta: [{ title: 'Portal de Desenvolvedores | Followw' }] }),
    loader: async ({ context: { queryClient } }) => {
        const user = await loadQuery(queryClient, meQueryOptions);
        if (!user) throw redirect({ to: '/login' });
        await loadQuery(queryClient, oauthClientsQueryOptions).catch(() => null);
    },
    errorComponent: ErrorState,
    component: DevelopersPage
});

function DevelopersPage() {
    const me = useQuery(meQueryOptions);
    const clients = useQuery(oauthClientsQueryOptions);
    const queryClient = useQueryClient();
    const online = useOnline();

    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState<OAuthClient | null>(null);
    const [revealedSecret, setRevealedSecret] = useState<{
        clientId: string;
        clientSecret: string;
        title: string;
    } | null>(null);

    const invalidate = () =>
        queryClient.invalidateQueries({ queryKey: oauthClientsQueryOptions.queryKey });

    const rotateMutation = useMutation({
        mutationFn: (clientId: string) => rotateOAuthClientSecret(clientId),
        onSuccess: (result) => {
            setRevealedSecret({
                clientId: result.client_id,
                clientSecret: result.client_secret,
                title: 'Novo client_secret gerado'
            });
            void invalidate();
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (clientId: string) => deleteOAuthClient(clientId),
        onSuccess: () => {
            void invalidate();
        }
    });

    if (me.data === null) return <Navigate to="/login" replace />;

    const items = clients.data ?? [];

    return (
        <main className="min-h-dvh bg-background px-6 py-10 text-foreground">
            <div className="mx-auto flex max-w-3xl flex-col gap-8">
                <header className="flex flex-col gap-6">
                    <div className="flex items-center justify-between gap-4">
                        <Link
                            to="/perfil"
                            className="flex w-fit items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
                        >
                            <ArrowLeft className="size-4" aria-hidden="true" />
                            Voltar ao Followw
                        </Link>
                        <a
                            href="https://docs.followw.app"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                            <BookOpen className="size-4" aria-hidden="true" />
                            Documentação da API
                        </a>
                    </div>

                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <FollowwLogo className="size-10 shrink-0" />
                            <div className="flex flex-col gap-1">
                                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                                    Portal de Desenvolvedores
                                </h1>
                                <p className="text-sm text-muted-foreground">
                                    Cadastre aplicações para autenticar estudantes com &quot;Entrar
                                    com Followw&quot; e consumir a API com escopos OAuth.
                                </p>
                            </div>
                        </div>

                        <Button
                            onClick={() => setCreateOpen(true)}
                            disabled={!online}
                            className="shrink-0 gap-2"
                        >
                            <Plus className="size-4" aria-hidden="true" />
                            Nova aplicação
                        </Button>
                    </div>
                </header>

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
                    <Card>
                        <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
                            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <Code2 className="size-6" aria-hidden="true" />
                            </span>
                            <div className="flex max-w-md flex-col gap-1">
                                <h2 className="text-base font-semibold">
                                    Nenhuma aplicação cadastrada
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    Crie sua primeira aplicação OAuth para obter um{' '}
                                    <code>client_id</code> e integrar bots, apps mobile ou projetos
                                    web à API do Followw.
                                </p>
                            </div>
                            <Button
                                onClick={() => setCreateOpen(true)}
                                disabled={!online}
                                className="gap-2"
                            >
                                <Plus className="size-4" aria-hidden="true" />
                                Criar primeira aplicação
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <section aria-label="Suas aplicações" className="flex flex-col gap-4">
                        {items.map((item) => (
                            <ClientCard
                                key={item.id}
                                client={item}
                                disabled={!online}
                                rotating={
                                    rotateMutation.isPending && rotateMutation.variables === item.id
                                }
                                deleting={
                                    deleteMutation.isPending && deleteMutation.variables === item.id
                                }
                                onEdit={() => setEditing(item)}
                                onRotateSecret={() => rotateMutation.mutate(item.id)}
                                onDelete={() => deleteMutation.mutate(item.id)}
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
                            const created = await createOAuthClient(body);
                            await invalidate();
                            if (created.client_secret) {
                                setRevealedSecret({
                                    clientId: created.id,
                                    clientSecret: created.client_secret,
                                    title: 'Aplicação criada — salve seu client_secret'
                                });
                            }
                        }}
                    />
                )}

                {editing && (
                    <ClientFormDialog
                        key={editing.id}
                        mode="edit"
                        client={editing}
                        open
                        onOpenChange={(open) => {
                            if (!open) setEditing(null);
                        }}
                        onSubmit={async (body) => {
                            await updateOAuthClient(editing.id, body);
                            await invalidate();
                        }}
                    />
                )}

                {revealedSecret && (
                    <ClientSecretDialog
                        open
                        onOpenChange={(open) => {
                            if (!open) setRevealedSecret(null);
                        }}
                        clientId={revealedSecret.clientId}
                        clientSecret={revealedSecret.clientSecret}
                        title={revealedSecret.title}
                    />
                )}
            </div>
        </main>
    );
}

function ClientCard({
    client,
    disabled,
    rotating,
    deleting,
    onEdit,
    onRotateSecret,
    onDelete
}: {
    client: OAuthClient;
    disabled: boolean;
    rotating: boolean;
    deleting: boolean;
    onEdit: () => void;
    onRotateSecret: () => void;
    onDelete: () => void;
}) {
    const [copied, setCopied] = useState(false);

    async function copyId() {
        try {
            await navigator.clipboard.writeText(client.id);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {}
    }

    return (
        <Card>
            <CardContent className="flex flex-col gap-4 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold">{client.name}</h2>
                            <Badge variant={client.confidential ? 'default' : 'secondary'}>
                                {client.confidential ? 'Confidencial' : 'Pública'}
                            </Badge>
                            {client.homepage_url && (
                                <a
                                    href={client.homepage_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Abrir site de ${client.name}`}
                                    className="text-muted-foreground hover:text-primary"
                                >
                                    <ExternalLink className="size-4" aria-hidden="true" />
                                </a>
                            )}
                        </div>
                        {client.description && (
                            <p className="text-sm text-muted-foreground">{client.description}</p>
                        )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={disabled}
                            onClick={onEdit}
                            className="gap-1.5"
                        >
                            <Pencil className="size-3.5" aria-hidden="true" />
                            Editar
                        </Button>

                        {client.confidential && (
                            <AlertDialog>
                                <AlertDialogTrigger
                                    disabled={disabled || rotating}
                                    render={
                                        <Button variant="outline" size="sm" className="gap-1.5" />
                                    }
                                >
                                    <KeyRound className="size-3.5" aria-hidden="true" />
                                    {rotating ? 'Gerando...' : 'Rotacionar segredo'}
                                </AlertDialogTrigger>
                                <AlertDialogContent size="sm">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>
                                            Rotacionar client_secret?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                            O segredo atual de {client.name} deixará de funcionar
                                            imediatamente. Atualize suas variáveis de ambiente com o
                                            novo valor.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={onRotateSecret}>
                                            Gerar novo segredo
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}

                        <AlertDialog>
                            <AlertDialogTrigger
                                disabled={disabled || deleting}
                                render={
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-1.5 text-destructive hover:text-destructive"
                                    />
                                }
                            >
                                <Trash2 className="size-3.5" aria-hidden="true" />
                                Excluir
                            </AlertDialogTrigger>
                            <AlertDialogContent size="sm">
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir {client.name}?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        A aplicação será removida e todas as autorizações ativas de
                                        estudantes vinculadas a ela serão revogadas imediatamente.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction variant="destructive" onClick={onDelete}>
                                        Excluir aplicação
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Client ID</span>
                    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5">
                        <code className="flex-1 truncate text-xs">{client.id}</code>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => void copyId()}
                        >
                            {copied ? (
                                <>
                                    <Check className="size-3.5" aria-hidden="true" />
                                    Copiado
                                </>
                            ) : (
                                <>
                                    <Copy className="size-3.5" aria-hidden="true" />
                                    Copiar
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                        URIs de redirecionamento
                    </span>
                    <ul className="flex flex-col gap-1">
                        {client.redirect_uris.map((uri) => (
                            <li
                                key={uri}
                                className="truncate rounded-md bg-muted/40 px-2.5 py-1 font-mono text-xs text-muted-foreground"
                            >
                                {uri}
                            </li>
                        ))}
                    </ul>
                </div>
            </CardContent>
        </Card>
    );
}
