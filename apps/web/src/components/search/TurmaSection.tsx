import type { TurmaBusca } from '#/queries/search-classrooms';

import { TurmaCard } from '#/components/search/TurmaCard';

export function TurmaSection({ title, turmas }: { title: string; turmas: TurmaBusca[] }) {
    if (turmas.length === 0) return null;

    return (
        <section className="flex flex-col gap-3">
            <h2 className="text-base font-bold text-foreground">{title}</h2>
            <div className="flex flex-col gap-2.5">
                {turmas.map((turma) => (
                    <TurmaCard key={turma.id} turma={turma} />
                ))}
            </div>
        </section>
    );
}
