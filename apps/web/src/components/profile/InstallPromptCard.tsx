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

export function InstallPromptCard() {
    const mode = useSyncExternalStore(subscribeInstallSupport, getInstallMode, () => null);
    const [iosDialogOpen, setIosDialogOpen] = useState(false);
    if (!mode) return null;

    const installLabel = (
        <>
            <Download className="size-4" aria-hidden="true" />
            Instalar app
        </>
    );

    return (
        <Dialog open={iosDialogOpen} onOpenChange={setIosDialogOpen}>
            <Card as="section" className="relative" aria-label="Instalar Followw">
                <Button
                    variant="ghost"
                    className="absolute top-2 right-2 z-10 size-11 rounded-full bg-card/80"
                    onClick={dismissInstallCard}
                    aria-label="Ocultar sugestão de instalação"
                >
                    <X className="size-4" aria-hidden="true" />
                </Button>
                <CardContent className="flex flex-col gap-4">
                    <IosHomeScreenPreview />
                    <div className="flex flex-col gap-2">
                        <h2 className="text-lg leading-snug font-bold tracking-tight">
                            Tenha o Followw na sua tela inicial
                        </h2>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                            Suas turmas a um toque, direto da tela inicial.
                        </p>
                    </div>
                    {mode === 'ios' ? (
                        <DialogTrigger render={<Button className="h-11 w-full gap-2" />}>
                            {installLabel}
                        </DialogTrigger>
                    ) : (
                        <Button className="h-11 w-full gap-2" onClick={() => void promptInstall()}>
                            {installLabel}
                        </Button>
                    )}
                </CardContent>
            </Card>
            {mode === 'ios' && <IosInstallTour />}
        </Dialog>
    );
}
