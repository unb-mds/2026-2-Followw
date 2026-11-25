import type { components } from '@followw/core/queries/schema.gen.ts';

import { Button } from '#/components/ui/button';

type Grant = components['schemas']['OAuthGrantView'];

const lastAccessFormat: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' };

export function GrantItem({
    grant,
    disabled,
    onRevoke
}: {
    grant: Grant;
    disabled: boolean;
    onRevoke: () => void;
}) {
    return (
        <article className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
                <h3 className="font-medium">{grant.client_name ?? 'Aplicativo indisponível'}</h3>
                {grant.client_description && (
                    <p className="text-sm text-muted-foreground">{grant.client_description}</p>
                )}
                <p className="mt-2 text-sm text-muted-foreground">
                    Último acesso em{' '}
                    {new Date(grant.last_access_at).toLocaleString('pt-BR', lastAccessFormat)}
                </p>
            </div>
            <Button variant="destructive" disabled={disabled} onClick={onRevoke}>
                Revogar acesso
            </Button>
        </article>
    );
}
