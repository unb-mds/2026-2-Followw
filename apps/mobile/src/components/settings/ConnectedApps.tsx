import type { OAuthGrant } from '@followw/core/queries/oauth.ts';

import { useOnline } from '@followw/core/lib/online.ts';
import { api } from '@followw/core/queries/api.ts';
import { oauthGrantsQueryOptions } from '@followw/core/queries/oauth.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { CardSkeleton, LoadingSkeleton } from '@/components/LoadingSkeleton';
import { DeveloperPortalLink } from '@/components/settings/DeveloperPortalLink';
import { GrantItem } from '@/components/settings/GrantItem';
import { NoGrants } from '@/components/settings/NoGrants';
import { RevokeGrantDialog } from '@/components/settings/RevokeGrantDialog';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

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
        <View role="alert" className="gap-2">
            <Text className="text-sm">
                Não foi possível atualizar seus acessos. Tente novamente em instantes.
            </Text>
            <Button variant="outline" disabled={!online || fetching} onPress={onRetry}>
                <Text>Tentar novamente</Text>
            </Button>
        </View>
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
        <View className="gap-3">
            <Text role="heading" aria-level={2} className="text-lg font-semibold">
                Apps conectados
            </Text>
            {list === undefined && !failed && (
                <LoadingSkeleton label="Carregando acessos autorizados">
                    <CardSkeleton />
                </LoadingSkeleton>
            )}
            {list?.length !== 0 && failed && (
                <GrantsError fetching={grants.isFetching} onRetry={() => void grants.refetch()} />
            )}
            <View className="overflow-hidden rounded-2xl border border-border bg-card">
                {list?.length === 0 && <NoGrants />}
                {list?.map((grant, index) => (
                    <View key={grant.id} className={index > 0 ? 'border-t border-border' : ''}>
                        <GrantItem
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
                    </View>
                ))}
                <DeveloperPortalLink bordered={list !== undefined} />
            </View>
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
        </View>
    );
}
