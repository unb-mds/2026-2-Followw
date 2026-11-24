import type { OAuthClient } from '@followw/core/queries/oauth.ts';

import { Ellipsis, ExternalLink, KeyRound, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmActionDialog } from '#/components/developers/ConfirmActionDialog';
import { CopyField } from '#/components/developers/CopyField';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '#/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '#/components/ui/dropdown-menu';

// o conteúdo do menu força o texto destructive para cor de destaque; aqui ele volta
const DESTRUCTIVE_MENU =
    'w-52 **:data-[variant=destructive]:text-destructive! **:data-[variant=destructive]:**:text-destructive!';

export function ClientCard({
    client,
    disabled,
    onEdit,
    onRotateSecret,
    onDelete
}: {
    client: OAuthClient;
    disabled: boolean;
    onEdit: () => void;
    onRotateSecret: () => void;
    onDelete: () => void;
}) {
    const [confirm, setConfirm] = useState<'rotate' | 'delete' | null>(null);
    const closeConfirm = (open: boolean) => !open && setConfirm(null);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
                    {client.name}
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
                </CardTitle>
                {client.description && <CardDescription>{client.description}</CardDescription>}
                <CardAction>
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            aria-label={`Ações de ${client.name}`}
                            disabled={disabled}
                            render={<Button variant="ghost" size="icon" />}
                        >
                            <Ellipsis className="size-4" aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className={DESTRUCTIVE_MENU}>
                            <DropdownMenuItem onClick={onEdit}>
                                <Pencil />
                                Editar
                            </DropdownMenuItem>
                            {client.confidential && (
                                <DropdownMenuItem onClick={() => setConfirm('rotate')}>
                                    <KeyRound />
                                    Rotacionar segredo
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setConfirm('delete')}
                            >
                                <Trash2 />
                                Excluir
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </CardAction>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
                <CopyField label="Client ID" value={client.id} />

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

            <ConfirmActionDialog
                open={confirm === 'rotate'}
                onOpenChange={closeConfirm}
                title="Rotacionar client_secret?"
                description={`O segredo atual de ${client.name} deixará de funcionar imediatamente. Atualize suas variáveis de ambiente com o novo valor.`}
                confirmLabel="Gerar novo segredo"
                onConfirm={onRotateSecret}
            />
            <ConfirmActionDialog
                open={confirm === 'delete'}
                onOpenChange={closeConfirm}
                title={`Excluir ${client.name}?`}
                description="A aplicação será removida e todas as autorizações ativas de estudantes vinculadas a ela serão revogadas imediatamente."
                confirmLabel="Excluir aplicação"
                destructive
                onConfirm={onDelete}
            />
        </Card>
    );
}
