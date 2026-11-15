import type { SubjectKind } from '@followw/core/queries/subjects.ts';

import { subjectKindLabels } from '@followw/core/queries/subjects.ts';

import { Badge } from '#/components/ui/badge';

export function SubjectKindBadge({ kind }: { kind: SubjectKind | null | undefined }) {
    if (!kind) return null;
    return (
        <Badge variant={kind === 'mandatory' ? 'secondary' : 'outline'}>
            {subjectKindLabels[kind]}
        </Badge>
    );
}
