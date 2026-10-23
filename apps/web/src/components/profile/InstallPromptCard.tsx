import { Download, X } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';

import { IosHomeScreenPreview } from '#/components/profile/IosInstallIllustrations';
import { IosInstallTour } from '#/components/profile/IosInstallTour';
import { Button } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';
import { Dialog, DialogTrigger } from '#/components/ui/dialog';
import {
    dismissInstallCard,
    getInstallMode,
    promptInstall,
    subscribeInstallSupport
} from '#/integrations/offline/install';

export function InstallPromptCard({ previewIos = false }: { previewIos?: boolean }) {
    const detectedMode = useSyncExternalStore(subscribeInstallSupport, getInstallMode, () => null);
    const mode = previewIos ? 'ios' : detectedMode;
    const [previewDismissed, setPreviewDismissed] = useState(false);
    const [iosDialogOpen, setIosDialogOpen] = useState(false);
    if (!mode || previewDismissed) return null;

    if (mode === 'ios')
        return (
            <Dialog open={iosDialogOpen} onOpenChange={setIosDialogOpen}>
                <Card as="section" className="relative" aria-label="Instalar Followw">
                    <Button
                        variant="ghost"
                        className="absolute top-2 right-2 z-10 size-11 rounded-full bg-card/80"
                        onClick={previewIos ? () => setPreviewDismissed(true) : dismissInstallCard}
                        aria-label="Ocultar sugestão de instalação"
                    >
                        <X className="size-4" aria-hidden="true" />
                    </Button>
                    <CardContent className="flex flex-col gap-4">
                        <IosHomeScreenPreview />
                        <div className="flex flex-col gap-2 border-t pt-4">
                            <h2 className="text-lg leading-snug font-bold tracking-tight">
                                Tenha o Followw na sua tela inicial
                            </h2>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                                Suas turmas a um toque, direto da tela inicial.
                            </p>
                        </div>
                        <DialogTrigger render={<Button className="h-11 w-full gap-2" />}>
                            <Download className="size-4" aria-hidden="true" />
                            Instalar app
                        </DialogTrigger>
                    </CardContent>
                </Card>
                <IosInstallTour />
            </Dialog>
        );

    return (
        <Card as="section" className="relative" aria-label="Instalar Followw">
            <Button
                variant="ghost"
                size="icon-lg"
                className="absolute top-2 right-2"
                onClick={previewIos ? () => setPreviewDismissed(true) : dismissInstallCard}
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
                    <Button className="h-11 self-start px-4" onClick={() => void promptInstall()}>
                        Instalar app
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
