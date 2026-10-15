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
        <details className="group/requirements -ml-3 min-w-0 rounded-lg border bg-background/50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <span className="min-w-0">
                    {alternatives
                        ? `Ver ${requirements.length} alternativas`
                        : `Ver ${requirements[0].length} disciplinas`}
                </span>
                <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-open/requirements:rotate-180"
                    aria-hidden="true"
                />
            </summary>
            <div className="flex min-w-0 flex-col gap-3 border-t px-3 py-3">
                <p className="text-xs font-normal text-muted-foreground">
                    {alternatives
                        ? 'Uma alternativa completa é suficiente.'
                        : 'Todas as disciplinas abaixo são necessárias.'}
                </p>
                {requirements.map((group, index) => (
                    <div
                        key={group.map(({ code }) => code).join('|')}
                        className="flex min-w-0 flex-col gap-2"
                    >
                        {alternatives && (
                            <p className="text-xs font-semibold text-muted-foreground">
                                {`Alternativa ${index + 1}`}
                                {group.length > 1 ? ' · Todas as disciplinas deste grupo' : ''}
                            </p>
                        )}
                        <ul className="flex min-w-0 list-disc flex-col gap-1 pl-4">
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
