import type { CatalogSubject } from '#/queries/subjects';

import { SubjectKindBadge } from '#/components/search/SubjectKindBadge';
import { Badge } from '#/components/ui/badge';

export function SubjectSummary({
    subject,
    currentPeriod = null
}: {
    subject: CatalogSubject;
    currentPeriod?: number | null;
}) {
    // A API só envia período positivo.
    const period = subject.curriculum_period || null;
    const ahead = period != null && currentPeriod != null ? period > currentPeriod : null;
    return (
        <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs font-semibold text-primary">{subject.code}</span>
            <span className="text-sm leading-snug font-semibold">{subject.name}</span>
            {(subject.kind || period != null) && (
                <span className="-ml-0.5 flex flex-wrap items-center gap-2">
                    <SubjectKindBadge kind={subject.kind} />
                    {period != null && (
                        <Badge
                            variant={ahead == null ? 'outline' : ahead ? 'default' : 'destructive'}
                            className={ahead ? 'bg-primary/10 text-primary' : undefined}
                        >
                            {period}º semestre
                        </Badge>
                    )}
                </span>
            )}
        </span>
    );
}
