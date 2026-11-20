import {
    allClassroomsQueryOptions,
    classroomTeachingPlanQueryOptions
} from '@followw/core/queries/classrooms.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { ClassroomTeachingPlan } from '@/components/classroom/ClassroomTeachingPlan';
import { FollowwLogo } from '@/components/FollowwLogo';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export { ErrorState as ErrorBoundary } from '@/components/ErrorState';

export default function TeachingPlanScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const queryClient = useQueryClient();
    const me = useQuery(meQueryOptions);
    const classrooms = useQuery({ ...allClassroomsQueryOptions, enabled: Boolean(me.data) });
    const classroom = classrooms.data?.find((item) => item.id === id);
    const plan = useQuery({
        ...classroomTeachingPlanQueryOptions(id),
        enabled: classroom?.has_teaching_plan !== undefined && classroom.has_teaching_plan !== false
    });
    const missing =
        (classrooms.isSuccess && !classroom) ||
        classroom?.has_teaching_plan === false ||
        (plan.isSuccess && !plan.data);

    useEffect(() => {
        if (!missing) return;
        // a turma passa a constar sem plano e o link some
        void queryClient.invalidateQueries({ queryKey: allClassroomsQueryOptions.queryKey });
        router.replace({ pathname: '/turmas/[id]', params: { id } });
    }, [missing, queryClient, router, id]);

    if (me.isSuccess && !me.data) return <Redirect href="/login" />;

    const back = () =>
        router.canGoBack()
            ? router.back()
            : router.replace({ pathname: '/turmas/[id]', params: { id } });

    return (
        <Screen
            fullscreen
            contentContainerClassName="px-6 pt-10"
            onRefreshData={(client) => refreshQuery(client, classroomTeachingPlanQueryOptions(id))}
        >
            <View className="gap-12">
                <View className="gap-8">
                    <Pressable
                        accessibilityRole="link"
                        onPress={back}
                        className="flex-row items-center gap-2 self-start active:opacity-70"
                    >
                        <Icon as={ArrowLeft} className="size-4 text-primary" />
                        <Text className="text-sm text-primary">Voltar à turma</Text>
                    </Pressable>
                    {classroom && (
                        <View className="gap-3">
                            <View className="flex-row items-center gap-2">
                                <FollowwLogo size={20} />
                                <Text className="text-sm font-medium text-muted-foreground">
                                    Plano de ensino
                                </Text>
                            </View>
                            <Text
                                role="heading"
                                aria-level={1}
                                className="text-3xl font-bold tracking-tight"
                            >
                                {classroom.subject.name}
                            </Text>
                            <Text className="text-sm text-muted-foreground">
                                <Text className="text-sm font-semibold text-primary">
                                    {classroom.subject.code}
                                </Text>
                                {` · Turma ${classroom.number} · ${classroom.semester}`}
                            </Text>
                        </View>
                    )}
                </View>
                <QueryState
                    query={plan}
                    loading="Carregando plano de ensino..."
                    error="Não foi possível carregar o plano de ensino."
                    stale="Não foi possível atualizar o plano de ensino."
                >
                    {(data) => data && <ClassroomTeachingPlan plan={data} />}
                </QueryState>
            </View>
        </Screen>
    );
}
