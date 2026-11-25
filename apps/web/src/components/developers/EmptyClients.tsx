import { Code2, Plus } from 'lucide-react';

import { Button } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';

export function EmptyClients({ disabled, onCreate }: { disabled: boolean; onCreate: () => void }) {
    return (
        <Card>
            <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Code2 className="size-6" aria-hidden="true" />
                </span>
                <div className="flex max-w-md flex-col gap-1">
                    <h2 className="text-base font-semibold">Nenhuma aplicação cadastrada</h2>
                    <p className="text-sm text-muted-foreground">
                        Crie sua primeira aplicação OAuth para obter um <code>client_id</code> e
                        integrar bots, apps ou projetos à API do Followw.
                    </p>
                </div>
                <Button onClick={onCreate} disabled={disabled} className="gap-2">
                    <Plus className="size-4" aria-hidden="true" />
                    Criar primeira aplicação
                </Button>
            </CardContent>
        </Card>
    );
}
