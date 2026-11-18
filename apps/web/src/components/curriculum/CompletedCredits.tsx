import type { CompletedSubjects } from '@followw/core/lib/curriculum/types.ts';

import { stateLabels } from '@followw/core/lib/curriculum/model.ts';

export function CompletedCredits({
    completedSubjects,
    shown
}: {
    completedSubjects?: CompletedSubjects | null;
    shown?: ReadonlyMap<string, unknown>;
}) {
    const credits = Object.entries(completedSubjects ?? {}).flatMap(([code, kind]) =>
        kind === 'approved' || shown?.has(code) ? [] : [{ code, label: stateLabels[kind] }]
    );
    if (credits.length === 0) return null;
    return (
        <details className="rounded-2xl border bg-card p-4 text-sm">
            <summary className="cursor-pointer font-medium">
                Componentes cumpridos por aproveitamento, dispensa ou equivalência ({credits.length}
                )
            </summary>
            <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
                {credits.map(({ code, label }) => (
                    <li key={code}>
                        {code} · {label}
                    </li>
                ))}
            </ul>
        </details>
    );
}
