import type { ScheduledClass } from '@followw/core/lib/schedule.ts';
import type { Classroom } from '@followw/core/queries/classrooms.ts';

import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { ErrorCard, SIGAA_DOWN_MESSAGE } from '@/components/ErrorState';
import { ClassCard } from '@/components/home/ClassCard';
import { LoginPromptCard } from '@/components/home/LoginPromptCard';
import { SectionHeader } from '@/components/SectionHeader';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

interface TodayClassesSectionProps {
    loggedIn: boolean;
    noClassReason?: string;
    isLoadingError: boolean;
    onRetry: () => void;
    classes: ScheduledClass<Classroom>[];
}

export function TodayClassesSection(props: TodayClassesSectionProps) {
    const { loggedIn, noClassReason, isLoadingError, classes } = props;
    // sem aulas no dia, a seção some
    if (loggedIn && !noClassReason && !isLoadingError && !classes.length) return null;

    return (
        <View className="gap-2">
            <SectionHeader title="Aulas do dia" />
            <TodayClassesContent {...props} />
        </View>
    );
}

function TodayClassesContent({
    loggedIn,
    noClassReason,
    isLoadingError,
    onRetry,
    classes
}: TodayClassesSectionProps) {
    const router = useRouter();

    if (!loggedIn) return <LoginPromptCard />;
    if (noClassReason)
        return (
            <Card className="gap-0 p-4">
                <Text className="font-semibold">Não há aulas hoje</Text>
                <Text className="text-sm text-muted-foreground">{noClassReason}</Text>
            </Card>
        );
    if (isLoadingError) return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={onRetry} />;

    return (
        <View className="gap-2">
            {classes.map(({ item, start, end, status }) => (
                <ClassCard
                    key={`${item.id}-${start}`}
                    title={item.subject.name}
                    code={item.subject.code}
                    classNumber={item.number}
                    time={`${start}–${end}`}
                    location={item.room ?? 'Local não informado'}
                    status={status}
                    onClick={() =>
                        router.push({ pathname: '/turmas/[id]', params: { id: item.id } })
                    }
                />
            ))}
        </View>
    );
}
