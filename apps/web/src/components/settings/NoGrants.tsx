import { Unplug } from 'lucide-react';

export function NoGrants() {
    return (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Unplug className="size-6" aria-hidden="true" />
            </span>
            <div className="flex max-w-sm flex-col gap-1">
                <h3 className="font-semibold">Nenhum app conectado</h3>
                <p className="text-sm text-muted-foreground">
                    Quando você autorizar um app a acessar seus dados pelo Followw, ele aparecerá
                    aqui e você poderá revogar o acesso a qualquer momento.
                </p>
            </div>
        </div>
    );
}
