/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Ilustrações compostas têm uma única descrição acessível. */
import {
    AlignLeft,
    Bookmark,
    BookOpen,
    ChevronLeft,
    Copy,
    EyeOff,
    FileSearch,
    PlusSquare,
    RotateCw,
    Share,
    Star,
    X
} from 'lucide-react';

import { cn } from '#/lib/shadcn';

export function IosHomeScreenPreview() {
    return (
        <div className="flex justify-center rounded-2xl bg-linear-to-br from-primary/15 via-muted to-primary/5 px-4 py-7">
            <img
                src="/images/ios-install-dock.png"
                alt="O Followw ao lado dos seus aplicativos na tela inicial: Spotify, WhatsApp e Instagram"
                width={2160}
                height={728}
                className="h-auto w-full max-w-sm"
            />
        </div>
    );
}

function SafariRow({
    icon: Icon,
    children,
    highlighted = false
}: {
    icon: typeof Share;
    children: React.ReactNode;
    highlighted?: boolean;
}) {
    return (
        <div
            className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-3 text-xs',
                highlighted
                    ? 'bg-primary/10 font-medium text-foreground ring-2 ring-primary'
                    : 'text-foreground/75'
            )}
        >
            <Icon
                className={cn('size-4 shrink-0', highlighted && 'text-primary')}
                strokeWidth={1.6}
            />
            <span>{children}</span>
        </div>
    );
}

function SafariBar() {
    return (
        <div className="flex w-full items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-card shadow-sm">
                <ChevronLeft className="size-4 text-muted-foreground" />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border bg-card p-2 shadow-md">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-2 ring-primary">
                    <AlignLeft className="size-5" />
                </div>
                <span className="flex-1 text-center text-sm font-medium">followw.app</span>
                <RotateCw className="mr-1 size-4 shrink-0 text-muted-foreground" />
            </div>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-card shadow-sm">
                <Copy className="size-4" />
            </div>
        </div>
    );
}

function SafariMenu() {
    return (
        <div className="w-full max-w-64 rounded-3xl border bg-card p-3 shadow-lg">
            <SafariRow icon={Share} highlighted>
                Compartilhar
            </SafariRow>
            <SafariRow icon={Bookmark}>Adicionar a Favoritos</SafariRow>
            <SafariRow icon={BookOpen}>Adicionar Favorito a…</SafariRow>
            <div className="my-1 border-t" />
            <SafariRow icon={FileSearch}>Buscar na Página</SafariRow>
            <SafariRow icon={EyeOff}>Ocultar Itens que Distraem</SafariRow>
        </div>
    );
}

function SafariShareSheet() {
    return (
        <div className="w-full max-w-72 rounded-3xl border bg-card p-3 shadow-lg">
            <div className="mb-3 flex items-start gap-2 px-1 pt-1">
                <img src="/apple-touch-icon.png" alt="" className="size-9 rounded-lg" />
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">Followw · UnB</p>
                    <p className="mt-1 text-xs text-muted-foreground">followw.app</p>
                </div>
                <X className="size-4 text-muted-foreground" />
            </div>
            <div className="rounded-2xl bg-muted/70 p-1">
                <SafariRow icon={BookOpen}>Adicionar Favorito a…</SafariRow>
                <SafariRow icon={Star}>Preferidos</SafariRow>
                <SafariRow icon={FileSearch}>Buscar na Página</SafariRow>
                <SafariRow icon={PlusSquare} highlighted>
                    Adicionar à Tela de Início
                </SafariRow>
            </div>
            <div className="mx-auto mt-3 h-1 w-20 rounded-full bg-foreground/20" />
        </div>
    );
}

const screenshots = {
    menu: { component: SafariBar, label: 'Barra do Safari com o botão de menu destacado em verde' },
    share: {
        component: SafariMenu,
        label: 'Menu do Safari com a opção Compartilhar destacada em verde'
    },
    home: {
        component: SafariShareSheet,
        label: 'Opções de compartilhamento com Adicionar à Tela de Início destacado em verde'
    }
};

export type IosInstallScreenshot = keyof typeof screenshots;

export function IosInstallIllustration({ screenshot }: { screenshot: IosInstallScreenshot }) {
    const { component: Screenshot, label } = screenshots[screenshot];
    return (
        <div
            role="img"
            aria-label={label}
            className="flex min-h-72 items-center justify-center rounded-2xl border bg-linear-to-b from-muted/50 to-muted p-3"
        >
            <div aria-hidden="true" className="flex w-full justify-center">
                <Screenshot />
            </div>
        </div>
    );
}
