import { Download, Ellipsis, PlusSquare, Share, X } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';

import { Button } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '#/components/ui/dialog';
import {
    dismissInstallCard,
    getInstallMode,
    promptInstall,
    subscribeInstallSupport
} from '#/integrations/offline/install';

function IosInstallDialog() {
    return (
        <DialogContent
            className="max-h-9/10 gap-3 overflow-y-auto rounded-2xl p-4"
            showCloseButton={false}
        >
            <div className="flex items-start gap-3">
                <img src="/apple-touch-icon.png" alt="" className="size-10 shrink-0 rounded-xl" />
                <DialogHeader className="min-w-0 flex-1">
                    <DialogTitle className="text-lg leading-snug font-bold tracking-tight">
                        Instale o Followw
                    </DialogTitle>
                    <DialogDescription className="text-xs leading-relaxed">
                        No Safari, siga estes passos:
                    </DialogDescription>
                </DialogHeader>
                <DialogClose
                    render={<Button variant="ghost" size="icon-lg" />}
                    aria-label="Fechar instruções de instalação"
                >
                    <X className="size-5" aria-hidden="true" />
                </DialogClose>
            </div>

            <ol className="flex flex-col gap-3 border-y py-3">
                <li className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Share className="size-5" aria-hidden="true" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="font-semibold">1. Clique em Compartilhar</p>
                        <p className="text-xs leading-5 text-muted-foreground">
                            Abra o menu
                            <Ellipsis className="mx-1 inline size-4" aria-label="Mais opções" />
                            do navegador e toque em “Compartilhar”.
                        </p>
                    </div>
                </li>
                <li className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <PlusSquare className="size-5" aria-hidden="true" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="font-semibold">2. Adicione à Tela de Início</p>
                        <p className="text-xs leading-5 text-muted-foreground">
                            Toque em “Ver Mais”, e em seguida, selecione “Adicionar à Tela de
                            Início”.
                        </p>
                    </div>
                </li>
                <li className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Download className="size-5" aria-hidden="true" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="font-semibold">3. Confirme em Adicionar</p>
                        <p className="text-xs leading-5 text-muted-foreground">
                            Ative “Abrir como App da Web”, se aparecer, e toque em “Adicionar”.
                        </p>
                    </div>
                </li>
            </ol>

            <DialogClose render={<Button className="h-11 w-full" />}>Entendi</DialogClose>
        </DialogContent>
    );
}

export function InstallPromptCard() {
    const mode = useSyncExternalStore(subscribeInstallSupport, getInstallMode, () => null);
    const [iosDialogOpen, setIosDialogOpen] = useState(false);
    if (!mode) return null;

    return (
        <Dialog open={mode === 'ios' && iosDialogOpen} onOpenChange={setIosDialogOpen}>
            <Card as="section" className="relative" aria-label="Instalar Followw">
                <Button
                    variant="ghost"
                    size="icon-lg"
                    className="absolute top-2 right-2"
                    onClick={dismissInstallCard}
                    aria-label="Ocultar sugestão de instalação"
                >
                    <X className="size-4" aria-hidden="true" />
                </Button>
                <CardContent className="flex items-start gap-4">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Download className="size-6" aria-hidden="true" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-3">
                        <h2 className="pr-6 text-lg leading-snug font-bold tracking-tight">
                            Tenha o Followw na sua tela inicial
                        </h2>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                            Acesse o app com um toque e consulte suas turmas já acessadas mesmo sem
                            internet.
                        </p>
                        <Button
                            className="h-11 self-start px-4"
                            onClick={() =>
                                mode === 'ios' ? setIosDialogOpen(true) : void promptInstall()
                            }
                        >
                            Instalar app
                        </Button>
                    </div>
                </CardContent>
            </Card>
            <IosInstallDialog />
        </Dialog>
    );
}
