import { Check, Copy, ShieldAlert } from 'lucide-react';
import { useState } from 'react';

import { Button } from '#/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '#/components/ui/dialog';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clientId: string;
    clientSecret: string;
    title?: string;
}

export function ClientSecretDialog({
    open,
    onOpenChange,
    clientId,
    clientSecret,
    title = 'Guarde seu client_secret agora'
}: Props) {
    const [copiedField, setCopiedField] = useState<'id' | 'secret' | null>(null);

    async function copy(field: 'id' | 'secret', value: string) {
        try {
            await navigator.clipboard.writeText(value);
            setCopiedField(field);
            setTimeout(
                () => setCopiedField((current) => (current === field ? null : current)),
                2000
            );
        } catch {}
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        Por segurança, o Followw armazena apenas o hash criptográfico deste segredo.
                        Ele não poderá ser visualizado novamente após fechar esta janela.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4">
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span>
                            Nunca exponha o <code>client_secret</code> em código frontend, apps
                            mobile ou repositórios públicos.
                        </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">Client ID</span>
                        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                            <code className="flex-1 truncate text-xs">{clientId}</code>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={() => void copy('id', clientId)}
                            >
                                {copiedField === 'id' ? (
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
                            Client Secret
                        </span>
                        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                            <code className="flex-1 text-xs break-all">{clientSecret}</code>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={() => void copy('secret', clientSecret)}
                            >
                                {copiedField === 'secret' ? (
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
                </div>

                <DialogFooter>
                    <Button type="button" onClick={() => onOpenChange(false)}>
                        Entendi, já salvei
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
