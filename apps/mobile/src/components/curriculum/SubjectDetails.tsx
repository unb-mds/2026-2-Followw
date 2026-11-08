import type { AcademicState, FlowSubject } from '@followw/core/lib/curriculum/types.ts';

import { requirementGroups } from '@followw/core/lib/curriculum/format.ts';
import { stateLabels } from '@followw/core/lib/curriculum/model.ts';
import { titleCase } from '@followw/core/lib/profile.ts';
import { displayedRequirements } from '@followw/core/queries/subjects.ts';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Text } from '@/components/ui/text';

function NameList({ names }: { names: string[] }) {
    return (
        <View className="gap-1">
            {names.map((name) => (
                <Text key={name} className="text-sm font-normal text-muted-foreground">
                    {`• ${name}`}
                </Text>
            ))}
        </View>
    );
}

// uma alternativa vira lista simples; várias são numeradas, cada uma com suas matérias
function Groups({ groups }: { groups: string[][] }) {
    if (groups.length === 1) return <NameList names={groups[0]} />;
    return (
        <View className="gap-2">
            {groups.map((names, index) => (
                <View key={names.join('|')} className="gap-1">
                    <Text className="text-xs font-normal text-muted-foreground">
                        Alternativa {index + 1}
                    </Text>
                    <NameList names={names} />
                </View>
            ))}
        </View>
    );
}

const list = (groups: string[][] | null) => groups && <Groups groups={groups} />;

export function SubjectDetails({
    subject,
    state,
    unlocks,
    onShowClassrooms
}: {
    subject: FlowSubject;
    state?: AcademicState;
    unlocks?: FlowSubject[];
    onShowClassrooms: () => void;
}) {
    const displayed = displayedRequirements(subject);
    // como na busca, requisito existente sem alternativa exibida ganha aviso
    const requirements = (key: 'prerequisites' | 'corequisites') =>
        list(requirementGroups(displayed[key])) ??
        (requirementGroups(subject[key]) && (
            <Text className="text-sm font-normal text-muted-foreground">
                Nenhuma alternativa na matriz ou com turmas no semestre.
            </Text>
        ));
    const sections = [
        { label: 'Pré-requisitos', content: requirements('prerequisites') },
        { label: 'Correquisitos', content: requirements('corequisites') },
        { label: 'Equivalências', content: list(requirementGroups(displayed.equivalences)) },
        {
            label: 'Desbloqueia',
            content: unlocks?.length ? (
                <NameList names={unlocks.map((item) => titleCase(item.name))} />
            ) : null
        }
    ].filter((section) => section.content);
    return (
        <View className="gap-4">
            <View className="gap-1 pr-6">
                <DialogTitle className="text-left">{titleCase(subject.name)}</DialogTitle>
                <DialogDescription className="text-left">
                    {state && `${stateLabels[state]} · `}
                    {subject.period}º semestre
                </DialogDescription>
            </View>
            {sections.map(({ label, content }) => (
                <View key={label} className="gap-1">
                    <Text className="text-sm font-bold">{label}</Text>
                    {content}
                </View>
            ))}
            <Button onPress={onShowClassrooms}>
                <Text>Visualizar turmas</Text>
            </Button>
        </View>
    );
}
