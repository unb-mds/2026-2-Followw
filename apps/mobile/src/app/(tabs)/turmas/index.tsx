import { groupBySemester } from '@followw/core/lib/classroom-details.ts';
import { describeSchedule } from '@followw/core/lib/schedule.ts';
import { allClassroomsQueryOptions, finalGrade } from '@followw/core/queries/classrooms.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ErrorCard, SIGAA_DOWN_MESSAGE } from '@/components/ErrorState';
import { ClassCard } from '@/components/home/ClassCard';
import { LoginPromptCard } from '@/components/home/LoginPromptCard';
import { LoadingText } from '@/components/LoadingText';
import { OfflineBanner } from '@/components/OfflineBanner';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';
import { TabFilter } from '@/components/TabFilter';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

export { ErrorState as ErrorBoundary } from '@/components/ErrorState';

export default function ClassroomsScreen() {
    const me = useQuery(meQueryOptions);
    const user = me.data;

    return (
        <Screen
            onRefreshData={(queryClient) =>
                Promise.all([
                    refreshQuery(queryClient, meQueryOptions),
                    user && refreshQuery(queryClient, allClassroomsQueryOptions)
                ])
            }
        >
            <OfflineBanner />
            <QueryState
                query={me}
                loading="Carregando turmas..."
                error="Não foi possível carregar a conta."
                stale="Não foi possível atualizar a conta."
            >
                {(data) => (data ? <Classrooms /> : <LoginPromptCard />)}
            </QueryState>
        </Screen>
    );
}

function Classrooms() {
    const router = useRouter();
    const {
        data: classrooms,
        isPending,
        isLoadingError,
        refetch
    } = useQuery(allClassroomsQueryOptions);
    const [selected, setSelected] = useState<string>();

    const groups = groupBySemester(classrooms ?? []);
    const [semester, items] = groups.find(([name]) => name === selected) ?? groups[0] ?? [];

    if (isLoadingError)
        return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => void refetch()} />;

    return (
        <>
            {groups.length > 0 && (
                <TabFilter
                    label="Escolher semestre"
                    value={semester}
                    options={groups.map(([name]) => name)}
                    onChange={setSelected}
                />
            )}
            <View className="gap-2">
                {items?.map((classroom) => (
                    <ClassCard
                        key={classroom.id}
                        title={classroom.subject.name}
                        code={classroom.subject.code}
                        time={describeSchedule(classroom.schedule) ?? 'Horário a definir'}
                        location={
                            classroom.current
                                ? (classroom.room ?? 'Local não informado')
                                : undefined
                        }
                        classNumber={classroom.number}
                        grade={finalGrade(classroom)}
                        status={classroom.status === 'pending_enrollment' ? 'pending' : 'normal'}
                        onClick={() =>
                            router.push({ pathname: '/turmas/[id]', params: { id: classroom.id } })
                        }
                    />
                ))}
            </View>
            {(isPending || classrooms.length === 0) && (
                <Card>
                    <CardContent>
                        {isPending ? (
                            <LoadingText>Carregando turmas...</LoadingText>
                        ) : (
                            <Text className="text-center text-sm text-muted-foreground">
                                Nenhuma turma encontrada.
                            </Text>
                        )}
                    </CardContent>
                </Card>
            )}
        </>
    );
}
