import type { components } from '@followw/core/queries/schema.gen.ts';

import {
    CLASSROOM_TABS,
    type ClassroomTab,
    classroomTab
} from '@followw/core/lib/classroom-details.ts';
import { mailto } from '@followw/core/lib/contact.ts';
import { titleCase } from '@followw/core/lib/profile.ts';
import {
    allClassroomsQueryOptions,
    classroomFrequencyQueryOptions,
    classroomMembersQueryOptions,
    classroomPostsQueryOptions,
    classroomStatisticsQueryOptions,
    useMarkLessons
} from '@followw/core/queries/classrooms.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { ClassroomPosts } from '@/components/classroom/ClassroomPosts';
import { ClassroomStatistics } from '@/components/classroom/ClassroomStatistics';
import { ClassroomSummary } from '@/components/classroom/ClassroomSummary';
import { FrequencyContent } from '@/components/classroom/FrequencyContent';
import { ErrorCard, SIGAA_DOWN_MESSAGE, StaleDataNotice } from '@/components/ErrorState';
import { BackHeader } from '@/components/HeaderBar';
import { LoginPromptCard } from '@/components/home/LoginPromptCard';
import { ListCard } from '@/components/ListCard';
import { LoadingText } from '@/components/LoadingText';
import { openLink } from '@/components/Markdown';
import { PersonPhoto } from '@/components/PersonPhoto';
import { Screen } from '@/components/Screen';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';

export { ErrorState as ErrorBoundary } from '@/components/ErrorState';

type Member = components['schemas']['ClassroomMember'];
type Professor = components['schemas']['ProfessorRef'];

const TAB_LABELS: Record<ClassroomTab, string> = {
    frequency: 'Frequência',
    statistics: 'Estatísticas',
    posts: 'Postagens',
    members: 'Participantes'
};

const isTab = (value: unknown): value is ClassroomTab =>
    CLASSROOM_TABS.some((tab) => tab === value);

export default function ClassroomScreen() {
    const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
    const router = useRouter();
    const me = useQuery(meQueryOptions);
    const user = me.data;
    const classrooms = useQuery({ ...allClassroomsQueryOptions, enabled: Boolean(user) });
    const classroom = classrooms.data?.find((item) => item.id === id);
    const activeTab = classroom
        ? classroomTab(isTab(tab) ? tab : 'frequency', classroom.current)
        : 'frequency';

    return (
        <Screen
            header={<BackHeader to="/turmas" title="Minhas Turmas" />}
            onRefreshData={(queryClient) =>
                Promise.all([
                    refreshQuery(queryClient, meQueryOptions),
                    user && refreshQuery(queryClient, allClassroomsQueryOptions),
                    classroom && refreshTab[activeTab](queryClient, classroom.id)
                ])
            }
        >
            {!user ? (
                me.isPending ? (
                    <LoadingText>Carregando turma...</LoadingText>
                ) : (
                    <LoginPromptCard />
                )
            ) : classrooms.isLoadingError ? (
                <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => void classrooms.refetch()} />
            ) : classrooms.isPending ? (
                <InformationCard>
                    <LoadingText className="py-0">Carregando turma...</LoadingText>
                </InformationCard>
            ) : !classroom ? (
                <InformationCard>
                    <Text className="text-center text-sm text-muted-foreground">
                        Turma não encontrada.
                    </Text>
                </InformationCard>
            ) : (
                <>
                    <ClassroomSummary classroom={classroom} />
                    <Tabs
                        value={activeTab}
                        onValueChange={(value) => router.setParams({ tab: value })}
                        className="mt-5 gap-4"
                    >
                        <TabsList
                            variant="line"
                            accessibilityLabel="Detalhes da turma"
                            className="mr-0 h-auto w-full border-b border-border"
                        >
                            {CLASSROOM_TABS.filter(
                                (item) => classroomTab(item, classroom.current) === item
                            ).map((item) => (
                                <TabsTrigger
                                    key={item}
                                    value={item}
                                    className="h-auto min-w-0 py-2"
                                    activeClassName="text-primary dark:text-primary"
                                    indicatorClassName="bg-primary"
                                >
                                    <Text numberOfLines={1}>{TAB_LABELS[item]}</Text>
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        <TabsContent value="posts">
                            <ClassroomPosts key={id} id={classroom.id} />
                        </TabsContent>
                        {classroom.current ? (
                            <TabsContent value="frequency">
                                <FrequencyTab id={classroom.id} />
                            </TabsContent>
                        ) : (
                            <TabsContent value="statistics">
                                <ClassroomStatistics id={classroom.id} />
                            </TabsContent>
                        )}
                        <TabsContent value="members">
                            <MembersTab id={classroom.id} />
                        </TabsContent>
                    </Tabs>
                </>
            )}
        </Screen>
    );
}

const refreshTab = {
    frequency: (queryClient, id) => refreshQuery(queryClient, classroomFrequencyQueryOptions(id)),
    statistics: (queryClient, id) =>
        Promise.all([
            refreshQuery(queryClient, classroomStatisticsQueryOptions(id)),
            refreshQuery(queryClient, classroomFrequencyQueryOptions(id))
        ]),
    posts: (queryClient, id) => refreshQuery(queryClient, classroomPostsQueryOptions(id)),
    members: (queryClient, id) => refreshQuery(queryClient, classroomMembersQueryOptions(id))
} satisfies Record<ClassroomTab, (queryClient: QueryClient, id: string) => Promise<unknown>>;

function InformationCard({ children }: { children: React.ReactNode }) {
    return (
        <Card size="sm">
            <CardContent>{children}</CardContent>
        </Card>
    );
}

function TabLoading() {
    return (
        <InformationCard>
            <LoadingText className="py-0">Carregando informações...</LoadingText>
        </InformationCard>
    );
}

function TabError({ onRetry }: { onRetry: () => void }) {
    return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={onRetry} />;
}

function FrequencyTab({ id }: { id: string }) {
    const frequency = useQuery(classroomFrequencyQueryOptions(id));
    const markLessons = useMarkLessons(id);

    if (frequency.isPending) return <TabLoading />;
    if (frequency.isLoadingError) return <TabError onRetry={() => void frequency.refetch()} />;

    return (
        <>
            {frequency.isError && <StaleDataNotice subject="a frequência" className="mb-2" />}
            {markLessons.isError && (
                <Text role="alert" className="mb-2 text-sm text-destructive">
                    Não foi possível salvar a marcação. Tente novamente.
                </Text>
            )}
            <FrequencyContent
                data={frequency.data}
                pending={markLessons.isPending}
                onMark={(lessons, status) =>
                    markLessons.mutate(lessons.map((lesson) => ({ lesson_id: lesson.id, status })))
                }
            />
        </>
    );
}

function GroupTitle({ title, count }: { title: string; count: number }) {
    return (
        <Text role="heading" aria-level={3} className="mb-2 px-1 text-sm font-semibold">
            {title} <Text className="text-sm font-normal text-muted-foreground">{count}</Text>
        </Text>
    );
}

function MembersTab({ id }: { id: string }) {
    const members = useQuery(classroomMembersQueryOptions(id));

    if (members.isPending) return <TabLoading />;
    if (members.isLoadingError) return <TabError onRetry={() => void members.refetch()} />;
    const { professors, monitors, students } = members.data;
    if (professors.length + monitors.length + students.length === 0)
        return (
            <InformationCard>
                <Text className="text-center text-sm text-muted-foreground">
                    Nenhum participante encontrado.
                </Text>
            </InformationCard>
        );

    return (
        <View className="flex-col gap-4">
            <MemberGroup title="Professores" count={professors.length}>
                {professors.map((professor) => (
                    <ProfessorRow key={professor.siape ?? professor.name} professor={professor} />
                ))}
            </MemberGroup>
            <MemberGroup title="Monitores" count={monitors.length}>
                {monitors.map((member) => (
                    <MemberRow key={member.registration} member={member} />
                ))}
            </MemberGroup>
            <MemberGroup title="Estudantes" count={students.length}>
                {students.map((member) => (
                    <MemberRow key={member.registration} member={member} />
                ))}
            </MemberGroup>
        </View>
    );
}

function MemberGroup({
    title,
    count,
    children
}: {
    title: string;
    count: number;
    children: React.ReactNode;
}) {
    if (count === 0) return null;
    return (
        <View>
            <GroupTitle title={title} count={count} />
            <ListCard>{children}</ListCard>
        </View>
    );
}

function ProfessorRow({ professor }: { professor: Professor }) {
    const router = useRouter();
    const { siape } = professor;
    const name = titleCase(professor.name);
    return (
        <PersonRow
            photo={professor.photo}
            name={
                siape == null ? (
                    name
                ) : (
                    <Text
                        accessibilityRole="link"
                        onPress={() =>
                            router.push({ pathname: '/professores/[siape]', params: { siape } })
                        }
                        className="text-sm font-medium"
                    >
                        {name}
                    </Text>
                )
            }
            email={professor.email}
        />
    );
}

function MemberRow({ member }: { member: Member }) {
    return (
        <PersonRow
            photo={member.photo}
            name={titleCase(member.name)}
            details={[member.course && titleCase(member.course.name), member.registration]
                .filter(Boolean)
                .join(' · ')}
            email={member.email}
        />
    );
}

function PersonRow({
    photo,
    name,
    details,
    email
}: {
    photo?: string | null;
    name: React.ReactNode;
    details?: string;
    email?: string | null;
}) {
    return (
        <View className="flex-row items-center gap-3 py-2.5">
            <PersonPhoto src={photo} />
            <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                    {name}
                </Text>
                {details && (
                    <Text numberOfLines={1} className="text-xs text-muted-foreground">
                        {details}
                    </Text>
                )}
                {email && (
                    <Text
                        accessibilityRole="link"
                        onPress={() => openLink(mailto(email))}
                        className="text-xs text-primary"
                    >
                        {email}
                    </Text>
                )}
            </View>
        </View>
    );
}
