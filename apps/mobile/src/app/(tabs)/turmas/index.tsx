import { groupBySemester } from '@followw/core/lib/classroom-details.ts';
import { allClassroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ClassroomCard } from '@/components/classroom/ClassroomCard';
import { ErrorCard, SIGAA_DOWN_MESSAGE } from '@/components/ErrorState';
import { HeaderBar, HeaderTitle } from '@/components/HeaderBar';
import { ClassCardSkeleton } from '@/components/home/ClassCard';
import { LoginPromptCard } from '@/components/home/LoginPromptCard';
import { LoadingSkeleton, repeat } from '@/components/LoadingSkeleton';
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
            header={
                <HeaderBar>
                    <HeaderTitle>Minhas Turmas</HeaderTitle>
                </HeaderBar>
            }
            onRefreshData={(queryClient) =>
                Promise.all([
                    refreshQuery(queryClient, meQueryOptions),
                    user && refreshQuery(queryClient, allClassroomsQueryOptions)
                ])
            }
        >
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
        <View className="gap-2">
            {groups.length > 0 && (
                <TabFilter
                    label="Escolher semestre"
                    value={semester}
                    options={groups.map(([name]) => name)}
                    onChange={setSelected}
                />
            )}
            <View className="flex-col gap-2">
                {items?.map((classroom) => (
                    <ClassroomCard
                        key={classroom.id}
                        classroom={classroom}
                        onClick={() =>
                            router.push({ pathname: '/turmas/[id]', params: { id: classroom.id } })
                        }
                    />
                ))}
            </View>
            {isPending ? (
                <LoadingSkeleton label="Carregando turmas..." className="gap-2">
                    {repeat(5, () => (
                        <ClassCardSkeleton />
                    ))}
                </LoadingSkeleton>
            ) : (
                classrooms.length === 0 && (
                    <Card>
                        <CardContent>
                            <Text className="text-center text-sm text-muted-foreground">
                                Nenhuma turma encontrada.
                            </Text>
                        </CardContent>
                    </Card>
                )
            )}
        </View>
    );
}
