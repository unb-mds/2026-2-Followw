import type { OAuthGrant } from '@followw/core/queries/oauth.ts';

import { useOnline } from '@followw/core/lib/online.ts';
import { api } from '@followw/core/queries/api.ts';
import { oauthGrantsQueryOptions } from '@followw/core/queries/oauth.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { LoadingSkeleton, CardSkeleton } from '#/components/LoadingSkeleton';
import { DeveloperPortalLink } from '#/components/settings/DeveloperPortalLink';
import { GrantItem } from '#/components/settings/GrantItem';
import { NoGrants } from '#/components/settings/NoGrants';
import { RevokeGrantDialog } from '#/components/settings/RevokeGrantDialog';
import { Button } from '#/components/ui/button';

type Selected = { id: string; name: string };

function useRevokeGrant(onDone: () => void) {
    const queryClient = useQueryClient();
    return api.useMutation('delete', '/oauth/grants/{grant_id}', {
        onSuccess: (_data, variables) => {
            queryClient.setQueryData<OAuthGrant[]>(oauthGrantsQueryOptions.queryKey, (previous) =>
                previous?.filter((grant) => grant.id !== variables.params.path.grant_id)
            );
            onDone();
            void queryClient.invalidateQueries({ queryKey: oauthGrantsQueryOptions.queryKey });
        }
    });
}

function GrantsError({ fetching, onRetry }: { fetching: boolean; onRetry: () => void }) {
    const online = useOnline();
    return (
        <div role="alert" className="flex flex-col gap-2 text-sm">
            <p>Não foi possível atualizar seus acessos. Tente novamente em instantes.</p>
            <Button variant="outline" disabled={!online || fetching} onClick={onRetry}>
                Tentar novamente
            </Button>
        </div>
    );
}

export function ConnectedApps() {
    const online = useOnline();
    const grants = useQuery(oauthGrantsQueryOptions);
    const [selected, setSelected] = useState<Selected | null>(null);
    const revoke = useRevokeGrant(() => setSelected(null));
    const list = grants.data;
    const failed = !online || grants.isError;
    return (
        <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Apps conectados</h2>
            {list === undefined && !failed && (
                <LoadingSkeleton label="Carregando acessos autorizados">
                    <CardSkeleton />
                </LoadingSkeleton>
            )}
            {list?.length !== 0 && failed && (
                <GrantsError fetching={grants.isFetching} onRetry={() => void grants.refetch()} />
            )}
            <div className="overflow-hidden rounded-2xl border bg-card">
                {list?.length === 0 && <NoGrants />}
                {list && list.length > 0 && (
                    <div className="flex flex-col divide-y">
                        {list.map((grant) => (
                            <GrantItem
                                key={grant.id}
                                grant={grant}
                                disabled={!online}
                                onRevoke={() => {
                                    revoke.reset();
                                    setSelected({
                                        id: grant.id,
                                        name: grant.client_name ?? 'este aplicativo'
                                    });
                                }}
                            />
                        ))}
                    </div>
                )}
                <DeveloperPortalLink />
            </div>
            <RevokeGrantDialog
                name={selected?.name ?? null}
                pending={revoke.isPending}
                failed={revoke.isError}
                disabled={!online}
                onClose={() => setSelected(null)}
                onConfirm={() => {
                    if (selected) revoke.mutate({ params: { path: { grant_id: selected.id } } });
                }}
            />
        </section>
    );
}
