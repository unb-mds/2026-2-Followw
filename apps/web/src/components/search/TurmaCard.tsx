import { Lock, MapPin } from 'lucide-react';

import type { TurmaBusca } from '#/queries/search-classrooms';

import { Card } from '#/components/ui/card';
import { cn } from '#/lib/shadcn';

export function TurmaCard({ turma }: { turma: TurmaBusca }) {
    const { disponivel } = turma;

    return (
        <Card
            size="sm"
            className={cn(
                'relative gap-1 px-3',
                !disponivel && 'bg-muted/60 opacity-75 ring-foreground/5'
            )}
        >
            <div className="flex items-center gap-2 text-xs">
                <span
                    className={cn(
                        'min-w-0 font-semibold tabular-nums',
                        disponivel ? 'text-primary' : 'text-muted-foreground'
                    )}
                >
                    {turma.horario}
                </span>
                <span className="ml-auto shrink-0 font-medium tracking-wide text-muted-foreground">
                    {turma.codigo} · {turma.turma}
                </span>
            </div>

            <div className="flex items-center justify-between gap-2">
                <h3
                    className={cn(
                        'line-clamp-2 text-sm leading-snug font-semibold',
                        disponivel ? 'text-foreground' : 'text-muted-foreground'
                    )}
                >
                    {turma.nome}
                </h3>
                {!disponivel && (
                    <Lock
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-label="Turma indisponível"
                    />
                )}
            </div>

            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">{turma.local}</span>
            </div>
        </Card>
    );
}
