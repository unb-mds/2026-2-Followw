import { AlignLeft, ArrowLeft, ArrowRight, Check, PlusSquare, Share, X } from 'lucide-react';
import { useState } from 'react';

import type { IosInstallScreenshot } from '#/components/profile/IosInstallIllustrations';

import { IosInstallIllustration } from '#/components/profile/IosInstallIllustrations';
import { Button } from '#/components/ui/button';
import {
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '#/components/ui/dialog';
import { cn } from '#/lib/shadcn';

const steps: {
    title: string;
    description: string;
    screenshot: IosInstallScreenshot;
    icon: typeof Share;
}[] = [
    {
        title: 'Abra o menu',
        description: 'No Safari, toque no ícone de menu ao lado do endereço do site.',
        screenshot: 'menu',
        icon: AlignLeft
    },
    {
        title: 'Selecione Compartilhar',
        description: 'No menu aberto, toque em “Compartilhar”.',
        screenshot: 'share',
        icon: Share
    },
    {
        title: 'Adicione à Tela de Início',
        description:
            'Role as opções e toque em “Adicionar à Tela de Início”. Se aparecer “Ver Mais”, toque nele primeiro.',
        screenshot: 'home',
        icon: PlusSquare
    }
];

function IosInstallTourContent() {
    const [page, setPage] = useState(0);
    const step = steps[page];
    const isSummary = !step;

    return (
        <>
            <div className="flex items-start gap-3">
                <img src="/apple-touch-icon.png" alt="" className="size-10 shrink-0 rounded-xl" />
                <DialogHeader className="min-w-0 flex-1 gap-1">
                    <DialogTitle className="text-lg leading-snug font-bold tracking-tight">
                        Instale o Followw
                    </DialogTitle>
                    <DialogDescription className="text-xs leading-relaxed">
                        Seu acesso à UnB, a um toque.
                    </DialogDescription>
                </DialogHeader>
                <DialogClose
                    render={<Button variant="ghost" className="size-11 shrink-0 rounded-full" />}
                    aria-label="Fechar instruções de instalação"
                >
                    <X className="size-5" aria-hidden="true" />
                </DialogClose>
            </div>

            <div aria-live="polite" aria-atomic="true">
                {step ? (
                    <div
                        key={step.screenshot}
                        className="flex flex-col gap-4 motion-safe:animate-in motion-safe:duration-200 motion-safe:fade-in"
                    >
                        <IosInstallIllustration screenshot={step.screenshot} />
                        <div className="flex min-h-24 flex-col gap-2">
                            <h2 className="text-lg font-bold tracking-tight">
                                {page + 1}. {step.title}
                            </h2>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                                {step.description}
                            </p>
                            {page === 0 && (
                                <p className="text-xs leading-relaxed text-muted-foreground">
                                    Se o botão de compartilhar já estiver na barra, toque nele e
                                    siga para a etapa 3.
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 motion-safe:animate-in motion-safe:duration-200 motion-safe:fade-in">
                        <div className="flex items-center gap-3 rounded-2xl bg-primary/10 p-4">
                            <Check className="size-6 shrink-0 text-primary" aria-hidden="true" />
                            <h2 className="text-base font-bold">Tudo pronto para instalar</h2>
                        </div>
                        <ol className="flex flex-col gap-4">
                            {steps.map(({ title, icon: Icon }, index) => (
                                <li key={title} className="flex items-center gap-3">
                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                        <Icon className="size-5" aria-hidden="true" />
                                    </div>
                                    <h3 className="text-base font-semibold">
                                        {index + 1}. {title}
                                    </h3>
                                </li>
                            ))}
                        </ol>
                        <p className="rounded-xl border p-3 text-xs leading-relaxed text-muted-foreground">
                            Para finalizar, ative{' '}
                            <strong className="font-medium text-foreground">
                                “Abrir como App da Web”
                            </strong>
                            , se aparecer, e toque em{' '}
                            <strong className="font-medium text-foreground">“Adicionar”</strong>.
                        </p>
                    </div>
                )}
            </div>

            <nav
                aria-label="Etapas da instalação"
                className="flex items-center justify-between gap-3 border-t pt-4"
            >
                <Button
                    variant="outline"
                    className="size-11 rounded-full"
                    aria-label="Instrução anterior"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                >
                    <ArrowLeft className="size-5" aria-hidden="true" />
                </Button>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                        {isSummary ? 'Resumo' : `Passo ${page + 1} de 3`}
                    </span>
                    <div className="flex gap-1.5" aria-hidden="true">
                        {[...steps.map(({ screenshot }) => screenshot), 'summary'].map(
                            (id, index) => (
                                <span
                                    key={id}
                                    className={cn(
                                        'h-1.5 rounded-full transition-all motion-reduce:transition-none',
                                        page === index ? 'w-5 bg-primary' : 'w-1.5 bg-primary/20'
                                    )}
                                />
                            )
                        )}
                    </div>
                </div>
                {isSummary ? (
                    <DialogClose
                        render={<Button className="size-11 rounded-full" />}
                        aria-label="Entendi"
                    >
                        <Check className="size-5" aria-hidden="true" />
                    </DialogClose>
                ) : (
                    <Button
                        className="size-11 rounded-full"
                        aria-label={page === 2 ? 'Ver instruções completas' : 'Próxima instrução'}
                        onClick={() => setPage(page + 1)}
                    >
                        <ArrowRight className="size-5" aria-hidden="true" />
                    </Button>
                )}
            </nav>
        </>
    );
}

export function IosInstallTour() {
    return (
        <DialogContent
            className="max-h-9/10 gap-4 overflow-y-auto rounded-3xl p-4 sm:max-w-md sm:p-6"
            showCloseButton={false}
        >
            <IosInstallTourContent />
        </DialogContent>
    );
}
