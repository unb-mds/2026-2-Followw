import type { OAuthGrant } from '@followw/core/queries/oauth.ts';

import { useOnline } from '@followw/core/lib/online.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import {
    OAUTH_SCOPE_LABELS,
    oauthGrantsQueryOptions,
    revokeOAuthGrant
} from '@followw/core/queries/oauth.ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, ShieldCheck, Unlink } from 'lucide-react';
import { useState } from 'react';

import { LoadingSkeleton } from '#/components/LoadingSkeleton';
import { ProfileSection } from '#/components/profile/ProfileOverview';
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
import { toast } from '#/components/ui/toast';

export function ConnectedAppsSection() {
    const grants = useQuery(oauthGrantsQueryOptions);
    const queryClient = useQueryClient();
    const online = useOnline();
    const [error, setError] = useState<string | null>(null);

    const revoke = useMutation({
        mutationFn: (grantId: string) => revokeOAuthGrant(grantId),
        onMutate: () => setError(null),
        onSuccess: () => {
            toast.add({ type: 'success', title: 'Acesso revogado' });
            void queryClient.invalidateQueries({ queryKey: oauthGrantsQueryOptions.queryKey });
        },
        onError: (err) => {
            const description =
                err instanceof ApiError && typeof err.detail === 'string'
                    ? err.detail
                    : 'Não foi possível revogar o acesso. Tente novamente.';
            setError(description);
            toast.add({
                type: 'error',
                title: 'Erro ao revogar acesso',
                description
            });
        }
    });

    if (grants.isPending) {
        return (
            <ProfileSection title="Apps conectados">
                <LoadingSkeleton label="Carregando aplicativos conectados...">
                    <Skeleton className="h-20 w-full rounded-xl" />
                </LoadingSkeleton>
            </ProfileSection>
        );
    }

    if (grants.isLoadingError) return null;

    const items = grants.data ?? [];

    return (
        <ProfileSection title="Apps conectados">
            {items.length === 0 ? (
                <Card>
                    <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
                        <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
                        <span>Nenhum aplicativo de terceiros possui acesso à sua conta.</span>
                    </CardContent>
                </Card>
            ) : (
                <div className="flex flex-col gap-3">
                    {error && (
                        <p role="alert" className="text-sm font-medium text-destructive">
                            {error}
                        </p>
                    )}
                    {items.map((grant) => (
                        <GrantCard
                            key={grant.id}
                            grant={grant}
                            disabled={!online || revoke.isPending}
                            onRevoke={() => revoke.mutate(grant.id)}
                        />
                    ))}
                </div>
            )}
        </ProfileSection>
    );
}

function GrantCard({
    grant,
    disabled,
    onRevoke
}: {
    grant: OAuthGrant;
    disabled: boolean;
    onRevoke: () => void;
}) {
    const title = grant.client_name ?? grant.client_id;
    const expiresLabel = new Date(grant.expires_at).toLocaleDateString('pt-BR');

    return (
        <Card>
            <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <span className="truncate font-semibold text-foreground">{title}</span>
                            {grant.client_homepage_url && (
                                <a
                                    href={grant.client_homepage_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Abrir site de ${title}`}
                                    className="text-muted-foreground hover:text-primary"
                                >
                                    <ExternalLink className="size-3.5" aria-hidden="true" />
                                </a>
                            )}
                        </div>
                        {grant.client_description && (
                            <p className="text-xs text-muted-foreground">
                                {grant.client_description}
                            </p>
                        )}
                        <p className="text-xs text-muted-foreground">Expira em {expiresLabel}</p>
                    </div>

                    <AlertDialog>
                        <AlertDialogTrigger
                            disabled={disabled}
                            render={
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 gap-1.5 text-destructive hover:text-destructive"
                                />
                            }
                        >
                            <Unlink className="size-3.5" aria-hidden="true" />
                            Revogar
                        </AlertDialogTrigger>
                        <AlertDialogContent size="sm">
                            <AlertDialogHeader>
                                <AlertDialogTitle>Revogar acesso de {title}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    O aplicativo perderá acesso imediato à sua conta do Followw e
                                    precisará pedir autorização novamente.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction variant="destructive" onClick={onRevoke}>
                                    Revogar acesso
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>

                <div className="flex flex-wrap gap-1.5">
                    {grant.scopes.map((scope) => (
                        <Badge key={scope} variant="secondary" className="text-xs font-normal">
                            {OAUTH_SCOPE_LABELS[scope] ?? scope}
                        </Badge>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
