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
    ChevronDown,
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

import { LoginPromptCard } from '#/components/home/LoginPromptCard';
import { Card } from '#/components/ui/Card';
import { ErrorCard, ErrorState, SIGAA_DOWN_MESSAGE } from '#/components/ui/ErrorState';
import { HeaderBar } from '#/components/ui/HeaderBar';
import { PullToRefresh } from '#/components/ui/PullToRefresh';
import { SectionHeader } from '#/components/ui/SectionHeader';
import { formatClassroomDate, groupMembers } from '#/lib/classroom-details';
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
            <Link
                to="/turmas"
                className="inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-bold text-ink transition hover:bg-white/70 hover:text-primary-dark"
            >
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
    const [tab, setTab] = useState<Tab>('news');
    const classroom = classrooms.data?.find((item) => item.id === id);

    return (
        <PullToRefresh disabled={!classroom} onRefresh={() => refreshTab(queryClient, tab, id)}>
            {!user ? (
                <LoginPromptCard />
            ) : classrooms.isError ? (
                <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => classrooms.refetch()} />
            ) : classrooms.isPending ? (
                <Card className="text-center text-sm text-muted">Carregando turma...</Card>
            ) : !classroom ? (
                <Card className="text-center text-sm text-muted">Turma não encontrada.</Card>
            ) : (
                <>
                    <ClassroomSummary classroom={classroom} />
                    <div
                        className="mt-6 border-b border-line"
                        role="tablist"
                        aria-label="Detalhes da turma"
                    >
                        <div className="grid grid-cols-3">
                            {tabs.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    id={'tab-' + item.id}
                                    role="tab"
                                    aria-selected={tab === item.id}
                                    onClick={() => setTab(item.id)}
                                    className={[
                                        'flex min-w-0 cursor-pointer flex-col items-center justify-center gap-1 border-b-2 px-1 py-2.5 text-sm font-bold transition-colors',
                                        tab === item.id
                                            ? 'border-primary text-primary-dark'
                                            : 'border-transparent text-muted hover:text-ink'
                                    ].join(' ')}
                                >
                                    <item.icon className="size-4" aria-hidden="true" />
                                    <span>{item.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    <section
                        className="pt-5"
                        role="tabpanel"
                        id={'panel-' + tab}
                        aria-labelledby={'tab-' + tab}
                    >
                        {tab === 'news' && <NewsTab id={id} />}
                        {tab === 'frequency' && <FrequencyTab id={id} />}
                        {tab === 'members' && <MembersTab id={id} />}
                    </section>
                </>
            )}
        </PullToRefresh>
    );
}

function ClassroomSummary({ classroom }: { classroom: Classroom }) {
    const schedule = describeSchedule(classroom.schedule);
    return (
        <Card accentColor="var(--color-primary)" className="p-5 pl-6">
            <p className="text-xs font-bold tracking-wider text-primary-dark uppercase">
                {classroom.subject.code ?? 'Disciplina'} • Turma {classroom.number}
            </p>
            <h1 className="mt-2 text-xl leading-tight font-extrabold tracking-tight text-ink">
                {classroom.subject.name}
            </h1>
            <p className="mt-1 text-sm text-muted">{classroom.semester}</p>
            <div className="mt-5 space-y-2 border-t border-line pt-4 text-sm text-ink-soft">
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
        </Card>
    );
}

function TabLoading() {
    return <Card className="text-center text-sm text-muted">Carregando informações...</Card>;
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
                <Card className="text-center text-sm text-muted">Nenhuma notícia publicada.</Card>
            ) : (
                <div className="space-y-3">
                    {news.data.map((item) => (
                        <NewsCard
                            key={item.id ?? item.published_on + item.title}
                            classroomId={id}
                            news={item}
                            opened={item.id != null && openedId === item.id}
                            onToggle={() =>
                                setOpenedId(openedId === item.id ? null : (item.id ?? null))
                            }
                        />
                    ))}
                </div>
            )}
        </>
    );
}

function NewsCard({
    classroomId,
    news,
    opened,
    onToggle
}: {
    classroomId: string;
    news: News;
    opened: boolean;
    onToggle: () => void;
}) {
    return (
        <Card>
            {news.id != null ? (
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={opened}
                    className="flex w-full cursor-pointer items-start justify-between gap-3 text-left"
                >
                    <NewsHeading news={news} />
                    <ChevronDown
                        className={[
                            'mt-1 size-4 shrink-0 text-muted transition-transform',
                            opened ? 'rotate-180' : ''
                        ].join(' ')}
                    />
                </button>
            ) : (
                <NewsHeading news={news} />
            )}
            {opened && news.id != null && <NewsDetail classroomId={classroomId} newsId={news.id} />}
        </Card>
    );
}

function NewsHeading({ news }: { news: News }) {
    return (
        <div>
            <p className="text-xs font-bold text-primary-dark">
                {formatClassroomDate(news.published_on)}
            </p>
            <h3 className="mt-1 text-sm font-bold text-ink">{news.title}</h3>
        </div>
    );
}

function NewsDetail({ classroomId, newsId }: { classroomId: string; newsId: number }) {
    const detail = useQuery(classroomNewsDetailQueryOptions(classroomId, newsId));

    if (detail.isPending) return <p className="mt-4 text-sm text-muted">Carregando notícia...</p>;
    if (detail.isError)
        return (
            <div className="mt-4">
                <TabError onRetry={() => detail.refetch()} />
            </div>
        );

    return (
        <div className="mt-4 border-t border-line pt-4">
            {detail.data.published_at && (
                <p className="mb-2 text-xs text-muted">{detail.data.published_at}</p>
            )}
            {detail.data.content && (
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink-soft">
                    {detail.data.content}
                </p>
            )}
            {detail.data.attachments.length > 0 && (
                <div className="mt-4 space-y-2">
                    <p className="text-xs font-bold tracking-wider text-muted uppercase">Anexos</p>
                    {detail.data.attachments.map((attachment) => (
                        <a
                            key={attachment.url}
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-sm font-bold text-primary-dark underline decoration-primary/30"
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
                <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-bold text-ink">Andamento das aulas</h3>
                    <span className="text-lg font-extrabold text-primary-dark">
                        {data.progress.percentage}%
                    </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                    {data.progress.taught}h ministradas de {data.progress.total}h
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-primary/10">
                    <div
                        className="h-full rounded-full bg-primary"
                        style={{
                            width: Math.min(100, Math.max(0, data.progress.percentage)) + '%'
                        }}
                    />
                </div>
            </Card>
            {data.frequency_status === 'not_registered' ? (
                <Card className="text-sm text-muted">
                    A frequência ainda não foi lançada pelo professor.
                </Card>
            ) : attendance && summary ? (
                <>
                    <Card>
                        <div className="flex items-baseline justify-between gap-2">
                            <h3 className="text-sm font-bold text-ink">Presença registrada</h3>
                            <span className="text-lg font-extrabold text-primary-dark">
                                {attendance.registered_percentage}%
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                            {attendance.attended}h presentes de {attendance.registered}h registradas
                        </p>
                        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
                            <div>
                                <p className="text-xs font-bold text-muted">Faltas lançadas</p>
                                <p className="text-xl font-extrabold text-ink">
                                    {summary.total_absences}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-muted">Aulas registradas</p>
                                <p className="text-xl font-extrabold text-ink">
                                    {summary.recorded_entries}/{summary.total_entries}
                                </p>
                            </div>
                        </div>
                    </Card>
                    {data.frequency_status === 'partially_registered' && (
                        <p className="px-1 text-xs text-muted">
                            Há aulas publicadas cuja frequência ainda não foi registrada.
                        </p>
                    )}
                    {attendance.entries.length > 0 && (
                        <div>
                            <SectionHeader title="Aulas" badge={attendance.entries.length} />
                            <Card className="divide-y divide-line py-1">
                                {entries?.map(({ entry, key }) => (
                                    <div
                                        key={key}
                                        className="flex items-center justify-between gap-3 py-3"
                                    >
                                        <span className="text-sm font-semibold text-ink">
                                            {formatClassroomDate(entry.occurred_on)}
                                        </span>
                                        <span
                                            className={[
                                                'text-xs font-bold',
                                                entry.status === 'presente'
                                                    ? 'text-success'
                                                    : entry.status === 'falta'
                                                      ? 'text-warning'
                                                      : 'text-muted'
                                            ].join(' ')}
                                        >
                                            {entry.status === 'presente'
                                                ? 'Presença'
                                                : entry.status === 'falta'
                                                  ? entry.absences +
                                                    (entry.absences === 1 ? ' falta' : ' faltas')
                                                  : 'Não registrada'}
                                        </span>
                                    </div>
                                ))}
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
                <Card className="text-center text-sm text-muted">
                    Nenhum participante encontrado.
                </Card>
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
            <h3 className="mb-2 px-1 text-sm font-bold text-ink">
                {title} <span className="text-muted">({members.length})</span>
            </h3>
            <div className="space-y-2">
                {members.map((member, index) => (
                    <Card
                        key={member.person_id ?? member.registration ?? index}
                        className="flex items-center gap-3 p-3"
                    >
                        {member.photo ? (
                            <img
                                src={member.photo}
                                alt=""
                                className="size-11 shrink-0 rounded-full object-cover"
                            />
                        ) : (
                            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary-dark">
                                <UserRound className="size-5" />
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-ink">{member.name}</p>
                            {member.course && <p className="text-xs text-muted">{member.course}</p>}
                            {member.registration && (
                                <p className="text-xs text-muted">{member.registration}</p>
                            )}
                            {member.email && (
                                <a
                                    className="text-xs break-all text-primary-dark"
                                    href={'mailto:' + member.email}
                                >
                                    {member.email}
                                </a>
                            )}
                        </div>
                    </Card>
                ))}
            </div>
        </section>
    );
}
