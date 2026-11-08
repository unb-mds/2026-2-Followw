import type { SubjectKind } from '@followw/core/queries/subjects.ts';

import { subjectKindLabels } from '@followw/core/queries/subjects.ts';

import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';

export function SubjectKindBadge({ kind }: { kind: SubjectKind | null | undefined }) {
    if (!kind) return null;
    return (
        <Badge variant={kind === 'mandatory' ? 'secondary' : 'outline'}>
            <Text>{subjectKindLabels[kind]}</Text>
        </Badge>
    );
}
