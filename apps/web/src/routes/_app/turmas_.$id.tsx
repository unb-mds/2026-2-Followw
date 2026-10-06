import {
    type QueryClient,
    useQuery,
    useQueryClient,
    useSuspenseQuery
} from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import {
    ArrowLeft,
    CalendarCheck2,
    CalendarDays,
    Clock3,
    MapPin,
    Newspaper,
    UserRound,
    UsersRound,
    type LucideIcon
} from 'lucide-react';
import { useState } from 'react';

import type { Classroom } from '#/queries/classrooms';
import type { components } from '#/queries/schema.gen';

import { ErrorCard, ErrorState, SIGAA_DOWN_MESSAGE } from '#/components/ErrorState';
import { HeaderBar } from '#/components/HeaderBar';
import { LoginPromptCard } from '#/components/home/LoginPromptCard';
import { PullToRefresh } from '#/components/PullToRefresh';
import { SectionHeader } from '#/components/SectionHeader';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '#/components/ui/accordion';
import { Badge } from '#/components/ui/badge';
import { buttonVariants } from '#/components/ui/button';
import { Card, CardContent, CardHeader } from '#/components/ui/card';
import { Progress } from '#/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs';
import { formatClassroomDate, groupMembers } from '#/lib/classroom-details';
import { Markdown } from '#/lib/markdown';
import { describeSchedule } from '#/lib/schedule';
import {
    allClassroomsQueryOptions,
    classroomFrequencyQueryOptions,
    classroomMembersQueryOptions,
    classroomNewsDetailQueryOptions,
    classroomNewsQueryOptions
} from '#/queries/classrooms';
import { meQueryOptions } from '#/queries/me';
import { refreshQuery } from '#/queries/refresh';

type Tab = 'news' | 'frequency' | 'members';
type News = components['schemas']['News'];
type Member = components['schemas']['ClassroomMember'];
type Frequency = components['schemas']['ClassroomFrequency'];

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
    { id: 'frequency', label: 'Frequência', icon: CalendarCheck2 },
    { id: 'news', label: 'Notícias', icon: Newspaper },
    { id: 'members', label: 'Participantes', icon: UsersRound }
];

function refreshTab(queryClient: QueryClient, tab: Tab, id: string) {
    if (tab === 'news') return refreshQuery(queryClient, classroomNewsQueryOptions(id));
    if (tab === 'frequency') return refreshQuery(queryClient, classroomFrequencyQueryOptions(id));
    return refreshQuery(queryClient, classroomMembersQueryOptions(id));
}

export const Route = createFileRoute('/_app/turmas_/$id')({
    loader: async ({ context: { queryClient } }) => {
        const user = await queryClient.query(meQueryOptions);
        if (user) await queryClient.query(allClassroomsQueryOptions).catch(() => undefined);
    },
    staticData: { header: ClassroomHeader },
    errorComponent: ErrorState,
    component: ClassroomPage
});

function ClassroomHeader() {
    return (
        <HeaderBar showLogo={false}>
            <Link to="/turmas" className={buttonVariants({ variant: 'ghost' })}>
                <ArrowLeft className="size-5" />
                Turmas
            </Link>
        </HeaderBar>
    );
}

function ClassroomPage() {
    const { id } = Route.useParams();
    const queryClient = useQueryClient();
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const classrooms = useQuery({ ...allClassroomsQueryOptions, enabled: Boolean(user) });
    const [tab, setTab] = useState<Tab>(tabs[0].id);
    const classroom = classrooms.data?.find((item) => item.id === id);

    return (
        <PullToRefresh disabled={!classroom} onRefresh={() => refreshTab(queryClient, tab, id)}>
            {!user ? (
                <LoginPromptCard />
            ) : classrooms.isError ? (
                <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => classrooms.refetch()} />
            ) : classrooms.isPending ? (
                <InformationCard>Carregando turma...</InformationCard>
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
                        className="mt-6 gap-5"
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
                                    className="h-auto min-w-0 flex-col gap-1 py-2.5"
                                >
                                    <item.icon className="size-4" aria-hidden="true" />
                                    <span>{item.label}</span>
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
        </PullToRefresh>
    );
}

function ClassroomSummary({ classroom }: { classroom: Classroom }) {
    const schedule = describeSchedule(classroom.schedule);
    return (
        <Card className="border-l-4 border-l-primary">
            <CardHeader>
                <p className="text-xs font-bold tracking-wider text-primary uppercase">
                    {classroom.subject.code ?? 'Disciplina'} • Turma {classroom.number}
                </p>
                <h1 className="mt-2 text-xl leading-tight font-extrabold tracking-tight text-foreground">
                    {classroom.subject.name}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">{classroom.semester}</p>
            </CardHeader>
            <CardContent>
                <div className="space-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
                    <p className="flex items-start gap-2">
                        <Clock3 className="mt-0.5 size-4 shrink-0 text-primary" />
                        {schedule ?? 'Horário a definir'}
                    </p>
                    <p className="flex items-start gap-2">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                        {classroom.room ?? 'Local não informado'}
                    </p>
                    {classroom.subject.hours != null && (
                        <p className="flex items-start gap-2">
                            <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" />
                            {classroom.subject.hours}h de carga horária
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

function TabLoading() {
    return <InformationCard>Carregando informações...</InformationCard>;
}

function InformationCard({ children }: { children: React.ReactNode }) {
    return (
        <Card>
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
    if (news.isError) return <TabError onRetry={() => news.refetch()} />;

    return (
        <>
            <SectionHeader title="Notícias da turma" badge={news.data.length} />
            {news.data.length === 0 ? (
                <InformationCard>Nenhuma notícia publicada.</InformationCard>
            ) : (
                <Accordion
                    value={openedId == null ? [] : [openedId]}
                    onValueChange={(value) => {
                        const nextId = value[0];
                        setOpenedId(typeof nextId === 'number' ? nextId : null);
                    }}
                    className="gap-3"
                >
                    {news.data.map((item) => (
                        <NewsCard
                            key={item.id ?? item.published_on + item.title}
                            classroomId={id}
                            news={item}
                            opened={item.id != null && openedId === item.id}
                        />
                    ))}
                </Accordion>
            )}
        </>
    );
}

function NewsCard({
    classroomId,
    news,
    opened
}: {
    classroomId: string;
    news: News;
    opened: boolean;
}) {
    return (
        <Card size="sm">
            <CardContent>
                {news.id != null ? (
                    <AccordionItem value={news.id}>
                        <AccordionTrigger className="gap-3 py-0 hover:no-underline">
                            <NewsHeading news={news} />
                        </AccordionTrigger>
                        <AccordionContent className="pb-0">
                            {opened && <NewsDetail classroomId={classroomId} newsId={news.id} />}
                        </AccordionContent>
                    </AccordionItem>
                ) : (
                    <h3>
                        <NewsHeading news={news} />
                    </h3>
                )}
            </CardContent>
        </Card>
    );
}

function NewsHeading({ news }: { news: News }) {
    return (
        <span className="block">
            <span className="block text-xs font-bold text-primary">
                {formatClassroomDate(news.published_on)}
            </span>
            <span className="mt-1 block text-sm font-bold text-foreground">{news.title}</span>
        </span>
    );
}

function NewsDetail({ classroomId, newsId }: { classroomId: string; newsId: number }) {
    const detail = useQuery(classroomNewsDetailQueryOptions(classroomId, newsId));

    if (detail.isPending)
        return <p className="mt-4 text-sm text-muted-foreground">Carregando notícia...</p>;
    if (detail.isError)
        return (
            <div className="mt-4">
                <TabError onRetry={() => detail.refetch()} />
            </div>
        );

    return (
        <div className="mt-4 border-t border-border pt-4">
            {detail.data.published_at && (
                <p className="mb-2 text-xs text-muted-foreground">{detail.data.published_at}</p>
            )}
            {detail.data.content && <Markdown>{detail.data.content}</Markdown>}
            {detail.data.attachments.length > 0 && (
                <div className="mt-4 space-y-2">
                    <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                        Anexos
                    </p>
                    {detail.data.attachments.map((attachment) => (
                        <a
                            key={attachment.url}
                            href={attachment.url}
                            target="_blank"
                            rel="external noopener noreferrer"
                            className="block text-sm font-bold text-primary underline decoration-primary/30"
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
    if (frequency.isError) return <TabError onRetry={() => frequency.refetch()} />;

    return <FrequencyContent data={frequency.data} />;
}

function FrequencyContent({ data }: { data: Frequency }) {
    const attendance = data.frequency;
    const summary = attendance?.summary;
    const occurrences = new Map<string, number>();
    const entries = attendance?.entries.map((entry) => {
        const signature = [entry.occurred_on, entry.status, entry.absences].join('-');
        const occurrence = occurrences.get(signature) ?? 0;
        occurrences.set(signature, occurrence + 1);
        return { entry, key: signature + '-' + occurrence };
    });

    return (
        <div className="space-y-4">
            <SectionHeader title="Frequência" />
            <Card>
                <CardContent>
                    <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-sm font-bold text-foreground">Andamento das aulas</h3>
                        <span className="text-lg font-extrabold text-primary">
                            {data.progress.percentage}%
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {data.progress.taught}h ministradas de {data.progress.total}h
                    </p>
                    <Progress
                        className="mt-3"
                        value={Math.min(100, Math.max(0, data.progress.percentage))}
                        aria-label="Andamento das aulas"
                    />
                </CardContent>
            </Card>
            {data.frequency_status === 'not_registered' ? (
                <InformationCard>
                    A frequência ainda não foi lançada pelo professor.
                </InformationCard>
            ) : attendance && summary ? (
                <>
                    <Card>
                        <CardContent>
                            <div className="flex items-baseline justify-between gap-2">
                                <h3 className="text-sm font-bold text-foreground">
                                    Presença registrada
                                </h3>
                                <span className="text-lg font-extrabold text-primary">
                                    {attendance.registered_percentage}%
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {attendance.attended}h presentes de {attendance.registered}h
                                registradas
                            </p>
                            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
                                <div>
                                    <p className="text-xs font-bold text-muted-foreground">
                                        Faltas lançadas
                                    </p>
                                    <p className="text-xl font-extrabold text-foreground">
                                        {summary.total_absences}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-muted-foreground">
                                        Aulas registradas
                                    </p>
                                    <p className="text-xl font-extrabold text-foreground">
                                        {summary.recorded_entries}/{summary.total_entries}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    {data.frequency_status === 'partially_registered' && (
                        <p className="px-1 text-xs text-muted-foreground">
                            Há aulas publicadas cuja frequência ainda não foi registrada.
                        </p>
                    )}
                    {attendance.entries.length > 0 && (
                        <div>
                            <SectionHeader title="Aulas" badge={attendance.entries.length} />
                            <Card className="py-1">
                                <CardContent className="divide-y divide-border">
                                    {entries?.map(({ entry, key }) => (
                                        <div
                                            key={key}
                                            className="flex items-center justify-between gap-3 py-3"
                                        >
                                            <span className="text-sm font-semibold text-foreground">
                                                {formatClassroomDate(entry.occurred_on)}
                                            </span>
                                            <Badge
                                                variant={
                                                    entry.status === 'presente'
                                                        ? 'secondary'
                                                        : entry.status === 'falta'
                                                          ? 'destructive'
                                                          : 'outline'
                                                }
                                            >
                                                {entry.status === 'presente'
                                                    ? 'Presença'
                                                    : entry.status === 'falta'
                                                      ? entry.absences +
                                                        (entry.absences === 1
                                                            ? ' falta'
                                                            : ' faltas')
                                                      : 'Não registrada'}
                                            </Badge>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </>
            ) : null}
        </div>
    );
}

function MembersTab({ id }: { id: string }) {
    const members = useQuery(classroomMembersQueryOptions(id));

    if (members.isPending) return <TabLoading />;
    if (members.isError) return <TabError onRetry={() => members.refetch()} />;

    const groups = groupMembers(members.data);
    return (
        <div className="space-y-5">
            <SectionHeader title="Participantes" badge={members.data.length} />
            {members.data.length === 0 ? (
                <InformationCard>Nenhum participante encontrado.</InformationCard>
            ) : (
                <>
                    <MemberGroup title="Professores" members={groups.professors} />
                    <MemberGroup title="Monitores" members={groups.monitors} />
                    <MemberGroup title="Estudantes" members={groups.students} />
                </>
            )}
        </div>
    );
}

function MemberGroup({ title, members }: { title: string; members: Member[] }) {
    if (members.length === 0) return null;
    return (
        <section>
            <h3 className="mb-2 px-1 text-sm font-bold text-foreground">
                {title} <span className="text-muted-foreground">({members.length})</span>
            </h3>
            <div className="space-y-2">
                {members.map((member, index) => (
                    <Card key={member.person_id ?? member.registration ?? index} size="sm">
                        <CardContent className="flex items-center gap-3">
                            {member.photo ? (
                                <img
                                    src={member.photo}
                                    alt=""
                                    className="size-11 shrink-0 rounded-full object-cover"
                                />
                            ) : (
                                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                    <UserRound className="size-5" />
                                </div>
                            )}
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-foreground">{member.name}</p>
                                {member.course && (
                                    <p className="text-xs text-muted-foreground">{member.course}</p>
                                )}
                                {member.registration && (
                                    <p className="text-xs text-muted-foreground">
                                        {member.registration}
                                    </p>
                                )}
                                {member.email && (
                                    <a
                                        className="text-xs break-all text-primary"
                                        href={'mailto:' + member.email}
                                    >
                                        {member.email}
                                    </a>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </section>
    );
}
