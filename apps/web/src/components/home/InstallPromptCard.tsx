import { ChevronDown, Download, Ellipsis, PlusSquare, Share, X } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import { Button } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
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
                </DialogHeader>
                <DialogClose
                    render={<Button variant="ghost" size="icon-lg" />}
                    aria-label="Fechar instruções de instalação"
                >
                    <X className="size-5" aria-hidden="true" />
                </DialogClose>
            </div>

            <DialogDescription className="text-xs leading-relaxed">
                No iPhone ou iPad, siga estes passos:
            </DialogDescription>

            <ol className="flex flex-col gap-3 border-y py-3">
                <li className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Share className="size-5" aria-hidden="true" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="font-semibold">1. Abra Compartilhar</p>
                        <p className="text-xs leading-5 text-muted-foreground">
                            Toque em compartilhar. Se preciso, abra o menu
                            <Ellipsis className="mx-1 inline size-4" aria-label="Mais opções" />
                            do navegador.
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
                            Selecione “Adicionar à Tela de Início”. Se preciso, toque em “Ver Mais”
                            <ChevronDown className="ml-1 inline size-4" aria-hidden="true" />.
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

            <p className="text-xs leading-relaxed text-muted-foreground">
                Sem essa opção? Veja “Editar Ações” ou abra o Followw no Safari.
            </p>
            <DialogClose render={<Button className="h-11 w-full" />}>Entendi</DialogClose>
        </DialogContent>
    );
}

export function InstallPromptCard() {
    const mode = useSyncExternalStore(subscribeInstallSupport, getInstallMode, () => null);
    if (!mode) return null;

    return (
        <Dialog>
            <Card as="section" className="relative mt-6" aria-label="Instalar Followw">
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
                        {mode === 'ios' ? (
                            <DialogTrigger render={<Button className="h-11 self-start px-4" />}>
                                Instalar app
                            </DialogTrigger>
                        ) : (
                            <Button
                                className="h-11 self-start px-4"
                                onClick={() => void promptInstall()}
                            >
                                Instalar app
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
            {mode === 'ios' && <IosInstallDialog />}
        </Dialog>
    );
}
