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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ClassroomPosts } from '@/components/classroom/ClassroomPosts';
import { ClassroomStatistics } from '@/components/classroom/ClassroomStatistics';
import { ClassroomSummary } from '@/components/classroom/ClassroomSummary';
import { FrequencyContent } from '@/components/classroom/FrequencyContent';
import { ErrorCard, SIGAA_DOWN_MESSAGE, StaleDataNotice } from '@/components/ErrorState';
import { LoginPromptCard } from '@/components/home/LoginPromptCard';
import { ListCard } from '@/components/ListCard';
import { LoadingText } from '@/components/LoadingText';
import { openLink } from '@/components/Markdown';
import { OfflineBanner } from '@/components/OfflineBanner';
import { PersonPhoto } from '@/components/PersonPhoto';
import { Screen } from '@/components/Screen';
import { ShareButton } from '@/components/ShareButton';
import { TabFilter } from '@/components/TabFilter';
import { Card, CardContent } from '@/components/ui/card';
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
        <>
            <Stack.Screen
                options={{
                    title: classroom?.subject.name ?? 'Turma',
                    headerLargeTitle: false,
                    // oxlint-disable-next-line react/no-unstable-nested-components -- header do Stack
                    headerRight: () =>
                        classroom ? (
                            <ShareButton
                                title={classroom.subject.name}
                                path={`/turmas/${classroom.id}`}
                            />
                        ) : null
                }}
            />
            <Screen
                onRefreshData={(queryClient) =>
                    Promise.all([
                        refreshQuery(queryClient, meQueryOptions),
                        user && refreshQuery(queryClient, allClassroomsQueryOptions),
                        classroom && refreshTab[activeTab](queryClient, classroom.id)
                    ])
                }
            >
                <OfflineBanner />
                {!user ? (
                    me.isPending ? (
                        <LoadingText>Carregando turma...</LoadingText>
                    ) : (
                        <LoginPromptCard />
                    )
                ) : classrooms.isLoadingError ? (
                    <ErrorCard
                        message={SIGAA_DOWN_MESSAGE}
                        onRetry={() => void classrooms.refetch()}
                    />
                ) : classrooms.isPending ? (
                    <InformationCard>
                        <LoadingText>Carregando turma...</LoadingText>
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
                        <TabFilter
                            label="Detalhes da turma"
                            value={activeTab}
                            options={CLASSROOM_TABS.filter(
                                (item) => classroomTab(item, classroom.current) === item
                            )}
                            labels={TAB_LABELS}
                            onChange={(value) => router.setParams({ tab: value })}
                        />
                        {activeTab === 'posts' && <ClassroomPosts key={id} id={classroom.id} />}
                        {activeTab === 'frequency' && <FrequencyTab id={classroom.id} />}
                        {activeTab === 'statistics' && <ClassroomStatistics id={classroom.id} />}
                        {activeTab === 'members' && <MembersTab id={classroom.id} />}
                    </>
                )}
            </Screen>
        </>
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
        <Card>
            <CardContent>{children}</CardContent>
        </Card>
    );
}

function TabLoading() {
    return (
        <InformationCard>
            <LoadingText>Carregando informações...</LoadingText>
        </InformationCard>
    );
}

function FrequencyTab({ id }: { id: string }) {
    const frequency = useQuery(classroomFrequencyQueryOptions(id));
    const markLessons = useMarkLessons(id);

    if (frequency.isPending) return <TabLoading />;
    if (frequency.isLoadingError)
        return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => void frequency.refetch()} />;

    return (
        <View className="gap-2">
            {frequency.isError && <StaleDataNotice subject="a frequência" />}
            {markLessons.isError && (
                <Text role="alert" className="text-sm text-destructive">
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
        </View>
    );
}

function MembersTab({ id }: { id: string }) {
    const members = useQuery(classroomMembersQueryOptions(id));

    if (members.isPending) return <TabLoading />;
    if (members.isLoadingError)
        return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => void members.refetch()} />;
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
        <View className="gap-4">
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
            <Text role="heading" aria-level={3} className="mb-2 px-1 text-sm font-semibold">
                {title} <Text className="text-sm font-normal text-muted-foreground">{count}</Text>
            </Text>
            <ListCard>{children}</ListCard>
        </View>
    );
}

function ProfessorRow({ professor }: { professor: Professor }) {
    const router = useRouter();
    const { siape } = professor;
    return (
        <PersonRow
            photo={professor.photo}
            name={titleCase(professor.name)}
            email={professor.email}
            onPress={
                siape == null
                    ? undefined
                    : () => router.push({ pathname: '/professores/[siape]', params: { siape } })
            }
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
    email,
    onPress
}: {
    photo?: string | null;
    name: string;
    details?: string;
    email?: string | null;
    onPress?: () => void;
}) {
    return (
        <Pressable
            disabled={!onPress}
            onPress={onPress}
            className="flex-row items-center gap-3 px-3 py-2.5 active:bg-accent"
        >
            <PersonPhoto src={photo} />
            <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm font-medium">
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
        </Pressable>
    );
}
