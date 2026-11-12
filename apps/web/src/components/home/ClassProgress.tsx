import { cn } from '#/lib/shadcn';

/** Trecho do trace do dia que enche com o andamento da aula; vermelho se houve falta. */
export function ClassProgress({ progress, absent }: { progress: number; absent: boolean }) {
    return (
        <div aria-hidden="true" className="flex w-0.5 shrink-0 bg-muted">
            <span
                className={cn(
                    'w-full transition-all duration-300 motion-reduce:transition-none',
                    absent ? 'bg-destructive' : 'bg-primary'
                )}
                style={{ height: `${progress * 100}%` }}
            />
        </div>
    );
}
