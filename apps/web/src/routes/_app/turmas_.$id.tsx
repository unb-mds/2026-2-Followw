import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute, useCanGoBack, useRouter } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';

import type { components } from '#/queries/schema.gen';

import { ClassroomPosts } from '#/components/classroom/ClassroomPosts';
import { ClassroomSummary } from '#/components/classroom/ClassroomSummary';
import { FrequencyContent } from '#/components/classroom/FrequencyContent';
import { ErrorCard, ErrorState, SIGAA_DOWN_MESSAGE } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import { LoginPromptCard } from '#/components/home/LoginPromptCard';
import { ListCard } from '#/components/ListCard';
import { LoadingText } from '#/components/LoadingText';
import { buttonVariants } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';
import { PersonPhoto } from '#/components/ui/person-photo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs';
import { groupMembers } from '#/lib/classroom-details';
import { titleCase } from '#/lib/profile';
import {
    allClassroomsQueryOptions,
    classroomFrequencyQueryOptions,
    classroomMembersQueryOptions,
    useMarkLessons
} from '#/queries/classrooms';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';

type Tab = 'posts' | 'frequency' | 'members';
type Member = components['schemas']['ClassroomMember'];

const tabs: { id: Tab; label: string }[] = [
    { id: 'frequency', label: 'Frequência' },
    { id: 'posts', label: 'Postagens' },
    { id: 'members', label: 'Participantes' }
];

export const Route = createFileRoute('/_app/turmas_/$id')({
    loader: async ({ context: { queryClient }, params }) => {
        const user = await loadQuery(queryClient, meQueryOptions);
        const classrooms = user
            ? await loadQuery(queryClient, allClassroomsQueryOptions).catch(noop)
            : undefined;
        return { subjectName: classrooms?.find(({ id }) => id === params.id)?.subject.name };
    },
    head: ({ loaderData }) => ({
        meta: [{ title: `${loaderData?.subjectName ?? 'Turma'} | Followw` }]
    }),
    staticData: { header: ClassroomHeader },
    errorComponent: ErrorState,
    component: ClassroomPage
});

function ClassroomHeader() {
    const router = useRouter();
    const canGoBack = useCanGoBack();

    return (
        <HeaderBar showLogo={false}>
            <Link
                to="/turmas"
                aria-label="Voltar"
                onClick={(event) => {
                    if (!canGoBack) return;
                    event.preventDefault();
                    router.history.back();
                }}
                className={buttonVariants({ variant: 'ghost', className: 'size-10' })}
            >
                <ArrowLeft className="size-5" />
            </Link>
            <HeaderTitle>Minhas Turmas</HeaderTitle>
        </HeaderBar>
    );
}

function ClassroomPage() {
    const { id } = Route.useParams();
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const classrooms = useQuery({ ...allClassroomsQueryOptions, enabled: Boolean(user) });
    const [tab, setTab] = useState<Tab>(tabs[0].id);
    const classroom = classrooms.data?.find((item) => item.id === id);

    return (
        <>
            {!user ? (
                <LoginPromptCard />
            ) : classrooms.isLoadingError ? (
                <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => classrooms.refetch()} />
            ) : classrooms.isPending ? (
                <InformationCard>
                    <LoadingText>Carregando turma...</LoadingText>
                </InformationCard>
            ) : !classroom ? (
                <InformationCard>Turma não encontrada.</InformationCard>
            ) : (
                <>
                    <ClassroomSummary classroom={classroom} />
                    <Tabs
                        value={tab}
                        onValueChange={(value) => {
                            if (value === 'posts' || value === 'frequency' || value === 'members') {
                                setTab(value);
                            }
                        }}
                        className="mt-5 gap-4"
                    >
                        <TabsList
                            variant="line"
                            className="grid w-full grid-cols-3 border-b border-border group-data-horizontal/tabs:h-auto"
                            aria-label="Detalhes da turma"
                        >
                            {tabs.map((item) => (
                                <TabsTrigger
                                    key={item.id}
                                    value={item.id}
                                    className="h-auto min-w-0 py-2 after:bg-primary data-active:text-primary"
                                >
                                    {item.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        <TabsContent value="posts">
                            <ClassroomPosts key={id} id={id} />
                        </TabsContent>
                        <TabsContent value="frequency">
                            <FrequencyTab id={id} />
                        </TabsContent>
                        <TabsContent value="members">
                            <MembersTab id={id} />
                        </TabsContent>
                    </Tabs>
                </>
            )}
        </>
    );
}

function TabLoading() {
    return (
        <InformationCard>
            <LoadingText>Carregando informações...</LoadingText>
        </InformationCard>
    );
}

function InformationCard({ children }: { children: React.ReactNode }) {
    return (
        <Card size="sm">
            <CardContent className="text-center text-sm text-muted-foreground">
                {children}
            </CardContent>
        </Card>
    );
}

function TabError({ onRetry }: { onRetry: () => void }) {
    return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={onRetry} />;
}

function FrequencyTab({ id }: { id: string }) {
    const frequency = useQuery(classroomFrequencyQueryOptions(id));
    const markLessons = useMarkLessons(id);

    if (frequency.isPending) return <TabLoading />;
    if (frequency.isLoadingError) return <TabError onRetry={() => frequency.refetch()} />;

    return (
        <>
            {markLessons.isError && (
                <p role="alert" className="mb-2 text-sm text-destructive">
                    Não foi possível salvar a marcação. Tente novamente.
                </p>
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
        <h3 className="mb-2 px-1 text-sm font-semibold">
            {title} <span className="font-normal text-muted-foreground">{count}</span>
        </h3>
    );
}

function MembersTab({ id }: { id: string }) {
    const members = useQuery(classroomMembersQueryOptions(id));

    if (members.isPending) return <TabLoading />;
    if (members.isLoadingError) return <TabError onRetry={() => members.refetch()} />;
    if (members.data.length === 0)
        return <InformationCard>Nenhum participante encontrado.</InformationCard>;

    const groups = groupMembers(members.data);
    return (
        <div className="flex flex-col gap-4">
            <MemberGroup title="Professores" members={groups.professors} />
            <MemberGroup title="Monitores" members={groups.monitors} />
            <MemberGroup title="Estudantes" members={groups.students} />
        </div>
    );
}

function MemberGroup({ title, members }: { title: string; members: Member[] }) {
    if (members.length === 0) return null;
    return (
        <section>
            <GroupTitle title={title} count={members.length} />
            <ListCard>
                {members.map((member, index) => (
                    <div
                        key={member.person_id ?? member.registration ?? index}
                        className="flex items-center gap-3 py-2.5"
                    >
                        <PersonPhoto src={member.photo} />
                        <div className="min-w-0 text-xs text-muted-foreground">
                            <p className="truncate text-sm font-medium text-foreground">
                                {titleCase(member.name)}
                            </p>
                            {(member.course || member.registration) && (
                                <p className="truncate">
                                    {[
                                        member.course && titleCase(member.course),
                                        member.registration
                                    ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                </p>
                            )}
                            {member.email && (
                                <a
                                    className="break-all text-primary"
                                    href={'mailto:' + member.email}
                                >
                                    {member.email}
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </ListCard>
        </section>
    );
}
