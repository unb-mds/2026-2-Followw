import { ChevronDown } from 'lucide-react';

import type { Requirements } from '#/queries/subjects';

import { formatRequirements, subjectRequirementLabel } from '#/queries/subjects';

export function RequirementList({ requirements }: { requirements: Requirements }) {
    if (!requirements.length) return null;
    if (requirements.length === 1 && requirements[0].length === 1) {
        return <span>{formatRequirements(requirements)}</span>;
    }

    const alternatives = requirements.length > 1;

    return (
        <details className="group/requirements min-w-0">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {alternatives
                    ? `Ver ${requirements.length} alternativas`
                    : `Ver ${requirements[0].length} disciplinas`}
                <ChevronDown
                    className="size-4 shrink-0 transition-transform group-open/requirements:rotate-180"
                    aria-hidden="true"
                />
            </summary>
            <div className="mt-2 flex min-w-0 flex-col gap-2 border-l pl-3 font-normal">
                <p className="text-xs text-muted-foreground">
                    {alternatives
                        ? 'Uma alternativa completa é suficiente.'
                        : 'Todas as disciplinas abaixo são necessárias.'}
                </p>
                {requirements.map((group, index) => (
                    <div
                        key={group.map(({ code }) => code).join('|')}
                        className="flex min-w-0 flex-col gap-1"
                    >
                        {alternatives && (
                            <p className="text-xs text-muted-foreground">
                                {`Alternativa ${index + 1}`}
                                {group.length > 1 ? ' · Todas as disciplinas deste grupo' : ''}
                            </p>
                        )}
                        <ul className="flex min-w-0 flex-col gap-1">
                            {group.map((requirement) => (
                                <li key={requirement.code} className="min-w-0 wrap-anywhere">
                                    {subjectRequirementLabel(requirement)}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </details>
    );
}
