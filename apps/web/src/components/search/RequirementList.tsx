import type { Requirements } from '#/queries/subjects';

import { SubjectDisclosure } from '#/components/search/SubjectDisclosure';
import { SubjectSearchLink } from '#/components/search/SubjectSearchLink';
import { subjectRequirementLabel } from '#/queries/subjects';

export function RequirementList({ requirements }: { requirements: Requirements }) {
    if (!requirements.length) return null;
    const alternatives = requirements.length > 1;

    return (
        <SubjectDisclosure count={new Set(requirements.flat().map(({ code }) => code)).size}>
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
                                <SubjectSearchLink query={subjectRequirementLabel(requirement)}>
                                    {subjectRequirementLabel(requirement)}
                                </SubjectSearchLink>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </SubjectDisclosure>
    );
}
