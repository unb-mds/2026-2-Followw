import { cn } from '#/lib/shadcn';

/** Barra vertical que enche com o andamento da aula; vermelha se houve falta no dia. */
export function ClassProgress({ progress, absent }: { progress: number; absent: boolean }) {
    return (
        <div aria-hidden="true" className="flex w-1.5 shrink-0 rounded-full bg-muted">
            <span
                className={cn(
                    'w-full rounded-full transition-all duration-300 motion-reduce:transition-none',
                    absent ? 'bg-destructive' : 'bg-primary'
                )}
                style={{ height: `${progress * 100}%` }}
            />
        </div>
    );
}
