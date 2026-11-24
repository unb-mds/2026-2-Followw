import { ShieldAlert } from 'lucide-react';

import { CopyField } from '#/components/developers/CopyField';
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

                    <CopyField label="Client ID" value={clientId} />
                    <CopyField label="Client Secret" value={clientSecret} wrap />
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
