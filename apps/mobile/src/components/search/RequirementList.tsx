import type { Requirements } from '@followw/core/queries/subjects.ts';

import { subjectRequirementLabel } from '@followw/core/queries/subjects.ts';
import { View } from 'react-native';

import { SubjectDisclosure } from '@/components/search/SubjectDisclosure';
import { SubjectSearchLink } from '@/components/search/SubjectSearchLink';
import { Text } from '@/components/ui/text';

export function RequirementList({ requirements }: { requirements: Requirements }) {
    if (!requirements.length)
        return (
            <Text className="text-xs font-normal text-muted-foreground">
                Nenhuma alternativa completa no currículo ou com turmas no semestre consultado.
            </Text>
        );
    const alternatives = requirements.length > 1;

    return (
        <SubjectDisclosure count={new Set(requirements.flat().map(({ code }) => code)).size}>
            {(alternatives || requirements[0].length > 1) && (
                <Text className="text-xs font-normal text-muted-foreground">
                    {alternatives
                        ? 'Uma alternativa completa é suficiente.'
                        : 'Todas as disciplinas abaixo são necessárias.'}
                </Text>
            )}
            {requirements.map((group, index) => (
                <View key={group.map(({ code }) => code).join('|')} className="min-w-0 gap-1">
                    {alternatives && (
                        <Text className="text-xs font-normal text-muted-foreground">
                            {`Alternativa ${index + 1}`}
                            {group.length > 1 ? ' · Todas as disciplinas deste grupo' : ''}
                        </Text>
                    )}
                    {group.map((requirement) => (
                        <SubjectSearchLink key={requirement.code} query={requirement.code}>
                            {subjectRequirementLabel(requirement)}
                        </SubjectSearchLink>
                    ))}
                </View>
            ))}
        </SubjectDisclosure>
    );
}
