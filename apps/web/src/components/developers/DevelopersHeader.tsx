import { Link } from '@tanstack/react-router';
import { ArrowLeft, BookOpen, Plus } from 'lucide-react';

import { FollowwLogo } from '#/components/FollowwLogo';
import { Button } from '#/components/ui/button';

export function DevelopersHeader({
    disabled,
    onCreate
}: {
    disabled: boolean;
    onCreate: () => void;
}) {
    return (
        <header className="flex flex-col gap-6">
            <div className="flex items-center justify-between gap-4">
                <Link
                    to="/perfil"
                    className="flex w-fit items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
                >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Voltar ao Followw
                </Link>
                <a
                    href="https://docs.followw.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                    <BookOpen className="size-4" aria-hidden="true" />
                    Documentação da API
                </a>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <FollowwLogo className="size-10 shrink-0" />
                    <div className="flex flex-col gap-1">
                        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                            Portal de Desenvolvedores
                        </h1>
                    </div>
                </div>

                <Button onClick={onCreate} disabled={disabled} className="shrink-0 gap-2">
                    <Plus className="size-4" aria-hidden="true" />
                    Nova aplicação
                </Button>
            </div>
        </header>
    );
}
