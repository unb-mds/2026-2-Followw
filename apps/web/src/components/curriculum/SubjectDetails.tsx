import type { AcademicState, FlowSubject } from '@followw/core/lib/curriculum/types.ts';

import { requirementGroups } from '@followw/core/lib/curriculum/format.ts';
import { stateLabels } from '@followw/core/lib/curriculum/model.ts';
import { titleCase } from '@followw/core/lib/profile.ts';
import { displayedRequirements } from '@followw/core/queries/subjects.ts';
import { Link } from '@tanstack/react-router';
import { X } from 'lucide-react';

import { Button, buttonVariants } from '#/components/ui/button';
import { DialogClose, DialogDescription, DialogTitle } from '#/components/ui/dialog';
import { cn } from '#/lib/shadcn';

function NameList({ names }: { names: string[] }) {
    return (
        <ul className="flex list-disc flex-col gap-1 pl-4">
            {names.map((name) => (
                <li key={name}>{name}</li>
            ))}
        </ul>
    );
}

// uma alternativa vira lista simples; várias são numeradas, cada uma com suas matérias
function Groups({ groups }: { groups: string[][] }) {
    if (groups.length === 1) return <NameList names={groups[0]} />;
    return (
        <ol className="flex flex-col gap-2">
            {groups.map((names, index) => (
                <li key={names.join('|')} className="flex flex-col gap-1">
                    <span className="text-xs">Alternativa {index + 1}</span>
                    <NameList names={names} />
                </li>
            ))}
        </ol>
    );
}

const list = (groups: string[][] | null) => groups && <Groups groups={groups} />;

export function SubjectDetails({
    subject,
    state,
    unlocks
}: {
    subject: FlowSubject;
    state?: AcademicState;
    unlocks?: FlowSubject[];
}) {
    const displayed = displayedRequirements(subject);
    // como na busca, requisito existente sem alternativa exibida ganha aviso
    const requirements = (key: 'prerequisites' | 'corequisites') =>
        list(requirementGroups(displayed[key])) ??
        (requirementGroups(subject[key]) &&
            'Nenhuma alternativa na matriz ou com turmas no semestre.');
    const sections = [
        { label: 'Pré-requisitos', content: requirements('prerequisites') },
        { label: 'Correquisitos', content: requirements('corequisites') },
        { label: 'Equivalências', content: list(requirementGroups(displayed.equivalences)) },
        {
            label: 'Desbloqueia',
            content: unlocks?.length ? (
                <NameList names={unlocks.map((item) => titleCase(item.name))} />
            ) : null
        }
    ].filter((section) => section.content);
    return (
        <>
            <div className="flex flex-col gap-1">
                <div className="flex items-start gap-2">
                    <DialogTitle className="min-w-0 flex-1">{titleCase(subject.name)}</DialogTitle>
                    <DialogClose
                        render={
                            <Button variant="ghost" size="icon-sm" className="-mt-1 shrink-0" />
                        }
                        aria-label="Fechar detalhes da matéria"
                    >
                        <X className="size-4" aria-hidden="true" />
                    </DialogClose>
                </div>
                <DialogDescription>
                    {state && <>{stateLabels[state]} · </>}
                    {subject.period}º semestre
                </DialogDescription>
            </div>
            {sections.length > 0 && (
                <dl className="flex flex-col gap-4 text-sm">
                    {sections.map(({ label, content }) => (
                        <div key={label}>
                            <dt className="mb-1 font-bold">{label}</dt>
                            <dd className="text-muted-foreground">{content}</dd>
                        </div>
                    ))}
                </dl>
            )}
            <Link
                to="/buscar"
                search={{ q: subject.code, category: 'classrooms' }}
                className={cn(buttonVariants(), 'w-full')}
            >
                Visualizar turmas
            </Link>
        </>
    );
}
