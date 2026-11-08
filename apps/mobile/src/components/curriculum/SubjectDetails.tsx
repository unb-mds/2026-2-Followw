import type { AcademicState, FlowSubject } from '@followw/core/lib/curriculum/types.ts';

import { requirementGroups } from '@followw/core/lib/curriculum/format.ts';
import { stateLabels } from '@followw/core/lib/curriculum/model.ts';
import { titleCase } from '@followw/core/lib/profile.ts';
import { displayedRequirements } from '@followw/core/queries/subjects.ts';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { View } from 'react-native';

import { openSearch } from '@/components/search/SubjectSearchLink';
import { Button } from '@/components/ui/button';
import { DialogClose, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

function NameList({ names }: { names: string[] }) {
    return (
        <View className="gap-1 pl-4">
            {names.map((name) => (
                <View key={name} className="flex-row gap-2">
                    <Text className="text-sm font-normal text-muted-foreground">•</Text>
                    <Text className="flex-1 text-sm font-normal text-muted-foreground">{name}</Text>
                </View>
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
    unlocks
}: {
    subject: FlowSubject;
    state?: AcademicState;
    unlocks?: FlowSubject[];
}) {
    const router = useRouter();
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
        <>
            <View className="gap-1">
                <View className="flex-row items-start gap-2">
                    <DialogTitle className="min-w-0 flex-1">{titleCase(subject.name)}</DialogTitle>
                    <DialogClose asChild>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="-mt-1 shrink-0"
                            accessibilityLabel="Fechar detalhes da matéria"
                        >
                            <Icon as={X} className="size-4" />
                        </Button>
                    </DialogClose>
                </View>
                <DialogDescription>
                    {state && `${stateLabels[state]} · `}
                    {subject.period}º semestre
                </DialogDescription>
            </View>
            {sections.length > 0 && (
                <View className="gap-4">
                    {sections.map(({ label, content }) => (
                        <View key={label}>
                            <Text className="mb-1 text-sm font-bold">{label}</Text>
                            {content}
                        </View>
                    ))}
                </View>
            )}
            <DialogClose asChild>
                <Button
                    className="w-full"
                    onPress={() => openSearch(router, subject.code, 'classrooms')}
                >
                    <Text>Visualizar turmas</Text>
                </Button>
            </DialogClose>
        </>
    );
}
