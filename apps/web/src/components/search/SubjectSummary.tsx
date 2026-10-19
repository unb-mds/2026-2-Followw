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
    return (
        <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs font-semibold text-primary">{subject.code}</span>
            <span className="text-sm leading-snug font-semibold">{subject.name}</span>
            {(subject.kind ||
                (subject.curriculum_period != null && subject.curriculum_period > 0)) && (
                <span className="-ml-0.5 flex flex-wrap items-center gap-2">
                    <SubjectKindBadge kind={subject.kind} />
                    {subject.curriculum_period != null && subject.curriculum_period > 0 && (
                        <Badge
                            variant={
                                currentPeriod == null
                                    ? 'outline'
                                    : subject.curriculum_period > currentPeriod
                                      ? 'default'
                                      : 'destructive'
                            }
                            className={
                                currentPeriod != null && subject.curriculum_period > currentPeriod
                                    ? 'bg-primary/10 text-primary'
                                    : undefined
                            }
                        >
                            {subject.curriculum_period}º semestre
                        </Badge>
                    )}
                </span>
            )}
        </span>
    );
}
