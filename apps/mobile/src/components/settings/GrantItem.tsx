import type { OAuthGrant } from '@followw/core/queries/oauth.ts';

import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

const lastAccess = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function GrantItem({
    grant,
    disabled,
    onRevoke
}: {
    grant: OAuthGrant;
    disabled: boolean;
    onRevoke: () => void;
}) {
    return (
        <View className="gap-3 p-4">
            <View className="min-w-0">
                <Text role="heading" aria-level={3} className="font-medium">
                    {grant.client_name ?? 'Aplicativo indisponível'}
                </Text>
                {grant.client_description && (
                    <Text className="text-sm text-muted-foreground">
                        {grant.client_description}
                    </Text>
                )}
                <Text className="mt-2 text-sm text-muted-foreground">
                    Último acesso em {lastAccess.format(new Date(grant.last_access_at))}
                </Text>
            </View>
            <Button variant="destructive" disabled={disabled} onPress={onRevoke}>
                <Text>Revogar acesso</Text>
            </Button>
        </View>
    );
}
