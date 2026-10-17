import type { SubjectKind } from '#/queries/subjects';

import { Badge } from '#/components/ui/badge';
import { subjectKindLabels } from '#/queries/subjects';

export function SubjectKindBadge({ kind }: { kind: SubjectKind | null | undefined }) {
    if (!kind) return null;
    return (
        <Badge variant={kind === 'mandatory' ? 'secondary' : 'outline'}>
            {subjectKindLabels[kind]}
        </Badge>
    );
}
