import { ShieldCheck, X } from 'lucide-react';

import { Button } from '#/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '#/components/ui/dialog';

export function LoginPrivacyInfo() {
    return (
        <Dialog>
            <div className="mt-8 max-w-90 text-center text-xs leading-5 text-muted-foreground">
                <p>
                    Suas credenciais <strong>não são armazenadas</strong> nos servidores do Followw.
                </p>
                <DialogTrigger
                    render={
                        <Button variant="link" className="mt-1 h-auto p-0 text-xs font-semibold" />
                    }
                >
                    Saiba mais
                </DialogTrigger>
            </div>

            <DialogContent className="max-w-110 gap-0 p-6 pb-8" showCloseButton={false}>
                <div className="flex items-start justify-between gap-4">
                    <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <ShieldCheck className="size-6" aria-hidden="true" />
                    </div>
                    <DialogClose
                        render={<Button variant="ghost" size="icon-lg" className="rounded-full" />}
                        aria-label="Fechar informações de privacidade"
                    >
                        <X className="size-5" aria-hidden="true" />
                    </DialogClose>
                </div>

                <DialogHeader className="mt-5">
                    <DialogTitle className="text-xl font-bold tracking-tight">
                        Seu acesso é protegido
                    </DialogTitle>
                    <DialogDescription className="mt-1 leading-6">
                        Você entra com sua conta do SIGAA. Suas credenciais são usadas para
                        autenticar nos servidores oficiais da UnB e não são armazenadas nos
                        servidores do Followw.
                    </DialogDescription>
                </DialogHeader>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    A sessão fica em cookies cifrados no seu navegador para manter o acesso entre
                    visitas.
                </p>
                <DialogClose
                    render={<Button className="mt-6 h-11 w-full rounded-full font-bold" />}
                >
                    Entendi
                </DialogClose>
            </DialogContent>
        </Dialog>
    );
}
