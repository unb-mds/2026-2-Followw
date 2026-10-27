import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

import { FollowwLogo } from '#/components/FollowwLogo';
import { buttonVariants } from '#/components/ui/button';
import { cn } from '#/lib/shadcn';

export const NotFoundPage: React.FC = () => (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-background text-foreground">
        <header className="absolute top-6 left-6 z-20 sm:top-8 sm:left-10">
            <Link
                to="/"
                aria-label="Followw — voltar ao início"
                className="block rounded-lg opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
                <FollowwLogo className="size-10" />
            </Link>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center px-6 py-24 sm:px-10">
            <div
                aria-hidden="true"
                className="pointer-events-none relative isolate aspect-4/3 w-full max-w-6xl select-none sm:aspect-2/1"
            >
                <img
                    src="/images/not-found/icc-exterior.webp"
                    alt=""
                    width="1500"
                    height="1000"
                    className="not-found-photo absolute bottom-0 -left-16 h-3/5 w-3/5 -rotate-6 mask-b-from-50% mask-b-to-100% object-cover opacity-70 grayscale sm:-left-20 dark:opacity-70 dark:brightness-125"
                />
                <img
                    src="/images/not-found/icc-corredor.webp"
                    alt=""
                    width="2304"
                    height="1728"
                    className="not-found-photo absolute top-6 -right-12 h-4/5 w-2/5 rotate-6 mask-b-from-50% mask-b-to-100% object-cover opacity-60 grayscale sm:-right-16 dark:opacity-65 dark:brightness-125"
                />
                <img
                    src="/images/not-found/collage.webp"
                    alt=""
                    width="1536"
                    height="1024"
                    fetchPriority="high"
                    className="relative z-10 size-full object-contain sm:px-16"
                />
            </div>

            <div className="relative z-10 mt-6 flex max-w-xl flex-col items-center text-center sm:mt-8">
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    <span className="sr-only">404 — </span>Essa página se perdeu.
                </h1>
                <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                    Vamos encontrar o caminho de volta.
                </p>
                <Link
                    to="/"
                    className={cn(
                        buttonVariants({ size: 'lg' }),
                        'mt-6 h-12 gap-2 rounded-2xl px-8'
                    )}
                >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Voltar ao início
                </Link>
            </div>
        </section>

        <footer className="absolute inset-x-0 bottom-0 z-10 px-6 pb-6 text-center text-xs text-muted-foreground">
            <p className="mx-auto max-w-xl leading-relaxed">
                Fotos do ICC:{' '}
                <a className="underline" href="https://commons.wikimedia.org/wiki/File:ICC_UnB.jpg">
                    Nossedotti
                </a>{' '}
                e{' '}
                <a
                    className="underline"
                    href="https://commons.wikimedia.org/wiki/File:Universidade_de_Bras%C3%ADlia_Instituto_Central_de_Ci%C3%AAncias_Minhoc%C3%A3o_corredor.JPG"
                >
                    G. A. Aucahuasi
                </a>{' '}
                ·{' '}
                <a className="underline" href="https://creativecommons.org/licenses/by-sa/3.0/">
                    CC BY-SA 3.0
                </a>
                <span className="sr-only">
                    . Nossedotti: domínio público. Guillermo Arévalo Aucahuasi: CC BY-SA 3.0.
                    Fotografias convertidas para WebP, recortadas e exibidas em preto e branco.
                </span>
            </p>
        </footer>
    </main>
);
