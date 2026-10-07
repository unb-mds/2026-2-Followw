import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { ArrowLeft, Clock3, Hourglass, MapPin } from 'lucide-react';
import { useState } from 'react';

import type { Classroom } from '#/queries/classrooms';
import type { components } from '#/queries/schema.gen';

import { FrequencyContent } from '#/components/classroom/FrequencyContent';
import { ErrorCard, ErrorState, SIGAA_DOWN_MESSAGE } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import { LoginPromptCard } from '#/components/home/LoginPromptCard';
import { ListCard } from '#/components/ListCard';
import { LoadingText } from '#/components/LoadingText';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '#/components/ui/accordion';
import { buttonVariants } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';
import { PersonPhoto } from '#/components/ui/person-photo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs';
import { formatClassroomDate, groupMembers } from '#/lib/classroom-details';
import { Markdown } from '#/lib/markdown';
import { titleCase } from '#/lib/profile';
import { describeSchedule } from '#/lib/schedule';
import {
    allClassroomsQueryOptions,
    classroomFrequencyQueryOptions,
    classroomMembersQueryOptions,
    classroomNewsDetailQueryOptions,
    classroomNewsQueryOptions
} from '#/queries/classrooms';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';

type Tab = 'news' | 'frequency' | 'members';
type News = components['schemas']['News'];
type Member = components['schemas']['ClassroomMember'];

const tabs: { id: Tab; label: string }[] = [
    { id: 'frequency', label: 'Frequência' },
    { id: 'news', label: 'Notícias' },
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
    return (
        <HeaderBar showLogo={false}>
            <Link
                to="/turmas"
                aria-label="Voltar para as turmas"
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
                            if (value === 'news' || value === 'frequency' || value === 'members') {
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
                        <TabsContent value="news">
                            <NewsTab id={id} />
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

function ClassroomSummary({ classroom }: { classroom: Classroom }) {
    const schedule = describeSchedule(classroom.schedule);
    return (
        <header>
            <p className="text-xs font-medium tracking-wide text-muted-foreground">
                <span className="font-semibold text-primary">
                    {classroom.subject.code ?? 'Disciplina'}
                </span>
                {` · Turma ${classroom.number} · ${classroom.semester}`}
            </p>
            <h1 className="mt-1 text-xl leading-tight font-semibold tracking-tight text-balance">
                {classroom.subject.name}
            </h1>
            <ul className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
                <SummaryItem icon={Clock3}>
                    <span className="font-medium text-primary tabular-nums">
                        {schedule ?? 'Horário a definir'}
                    </span>
                </SummaryItem>
                <SummaryItem icon={MapPin}>{classroom.room ?? 'Local não informado'}</SummaryItem>
                {classroom.subject.hours != null && (
                    <SummaryItem icon={Hourglass}>{classroom.subject.hours}h</SummaryItem>
                )}
            </ul>
        </header>
    );
}

function SummaryItem({
    icon: Icon,
    children
}: {
    icon: React.FC<{ className?: string }>;
    children: React.ReactNode;
}) {
    return (
        <li className="flex items-start gap-2">
            <Icon className="mt-1 size-3.5 shrink-0" />
            <span className="min-w-0">{children}</span>
        </li>
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

function NewsTab({ id }: { id: string }) {
    const news = useQuery(classroomNewsQueryOptions(id));
    const [openedId, setOpenedId] = useState<number | null>(null);

    if (news.isPending) return <TabLoading />;
    if (news.isLoadingError) return <TabError onRetry={() => news.refetch()} />;
    if (news.data.length === 0)
        return <InformationCard>Nenhuma notícia publicada.</InformationCard>;

    return (
        <ListCard>
            <Accordion
                value={openedId == null ? [] : [openedId]}
                onValueChange={(value) => {
                    const nextId = value[0];
                    setOpenedId(typeof nextId === 'number' ? nextId : null);
                }}
            >
                {news.data.map((item) =>
                    item.id != null ? (
                        <AccordionItem key={item.id} value={item.id}>
                            <AccordionTrigger className="gap-3 py-3 hover:no-underline">
                                <NewsHeading news={item} />
                            </AccordionTrigger>
                            <AccordionContent className="pb-3">
                                {openedId === item.id && (
                                    <NewsDetail classroomId={id} newsId={item.id} />
                                )}
                            </AccordionContent>
                        </AccordionItem>
                    ) : (
                        <h3 key={item.published_on + item.title} className="py-3 not-last:border-b">
                            <NewsHeading news={item} />
                        </h3>
                    )
                )}
            </Accordion>
        </ListCard>
    );
}

function NewsHeading({ news }: { news: News }) {
    return (
        <span className="block min-w-0">
            <span className="block text-xs font-medium text-primary tabular-nums">
                {formatClassroomDate(news.published_on)}
            </span>
            <span className="mt-0.5 block text-sm font-semibold text-foreground">{news.title}</span>
        </span>
    );
}

function NewsDetail({ classroomId, newsId }: { classroomId: string; newsId: number }) {
    const detail = useQuery(classroomNewsDetailQueryOptions(classroomId, newsId));

    if (detail.isPending)
        return (
            <p className="text-sm text-muted-foreground">
                <LoadingText>Carregando notícia...</LoadingText>
            </p>
        );
    if (detail.isLoadingError) return <TabError onRetry={() => detail.refetch()} />;

    return (
        <div>
            {detail.data.published_at && (
                <p className="mb-2 text-xs text-muted-foreground">{detail.data.published_at}</p>
            )}
            {detail.data.content && <Markdown>{detail.data.content}</Markdown>}
            {detail.data.attachments.length > 0 && (
                <div className="mt-4 flex flex-col gap-1">
                    <p className="text-xs font-medium text-muted-foreground">Anexos</p>
                    {detail.data.attachments.map((attachment) => (
                        <a
                            key={attachment.url}
                            href={attachment.url}
                            target="_blank"
                            rel="external noopener noreferrer"
                            className="block text-sm font-medium text-primary underline decoration-primary/30"
                        >
                            {attachment.name}
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}

function FrequencyTab({ id }: { id: string }) {
    const frequency = useQuery(classroomFrequencyQueryOptions(id));

    if (frequency.isPending) return <TabLoading />;
    if (frequency.isLoadingError) return <TabError onRetry={() => frequency.refetch()} />;

    return <FrequencyContent data={frequency.data} />;
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
