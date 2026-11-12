import { useQuery } from '@tanstack/react-query';
import { Check, IdCard } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { components } from '#/queries/schema.gen';

import { CourseProgress } from '#/components/profile/CourseProgress';
import { Card } from '#/components/ui/card';
import { PersonPhoto } from '#/components/ui/person-photo';
import { academicIndexes, titleCase, truncateProfileBio } from '#/lib/profile';
import { cn } from '#/lib/shadcn';
import { classroomsQueryOptions } from '#/queries/classrooms';

type UserProfile = components['schemas']['UserProfile'];

export function ProfileIdentity({
    user,
    displayName
}: {
    user: UserProfile;
    displayName?: string | null;
}) {
    return (
        <header>
            <div className="flex items-center gap-4">
                <PersonPhoto src={user.photo} size="lg" />
                <div className="flex min-w-0 flex-col justify-between gap-2">
                    <div>
                        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance">
                            {displayName || titleCase(user.name)}
                        </h1>
                        <RegistrationCopy value={user.registration} />
                    </div>
                    <div>
                        <p className="text-sm text-primary desktop:text-xl desktop:font-medium">
                            {[user.course && titleCase(user.course.name), user.unit?.code]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                        <p className="text-xs font-medium text-muted-foreground">{user.level}</p>
                    </div>
                </div>
            </div>
            {user.bio && <Bio text={user.bio} />}
        </header>
    );
}

export function AcademicPerformance({ user }: { user: UserProfile }) {
    const indexes = academicIndexes(user);
    if (indexes.length === 0) return null;

    return (
        <ProfileSection title="Desempenho">
            <Card
                size="sm"
                className="gap-0 overflow-visible bg-transparent py-0 shadow-none ring-0"
            >
                <dl className={cn('grid gap-3 desktop:gap-4', indexes.length > 1 && 'grid-cols-2')}>
                    {indexes.map((index) => (
                        <div
                            key={index.label}
                            className="rounded-2xl border bg-card p-4 shadow-sm desktop:p-5"
                        >
                            <dt className="text-xs font-medium text-muted-foreground">
                                <abbr title={index.description} className="no-underline">
                                    {index.label}
                                </abbr>
                            </dt>
                            <dd className="mt-2 text-3xl font-medium tracking-tight text-primary tabular-nums desktop:text-4xl">
                                {index.value}
                            </dd>
                        </div>
                    ))}
                </dl>
            </Card>
        </ProfileSection>
    );
}

export function ProgressSection({ user }: { user: UserProfile }) {
    if (user.integralization == null && !user.workload) return null;
    return (
        <ProfileSection title="Progresso do curso">
            <CurrentCourseProgress user={user} />
        </ProfileSection>
    );
}

function CurrentCourseProgress({ user }: { user: UserProfile }) {
    const { data } = useQuery(classroomsQueryOptions);
    return <CourseProgress user={user} classrooms={data ?? []} />;
}

export function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section aria-label={title}>
            <h2 className="mb-4 px-1 text-lg font-medium desktop:text-xl">{title}</h2>
            {children}
        </section>
    );
}

function Bio({ text }: { text: string }) {
    const ref = useRef<HTMLParagraphElement>(null);
    const [expanded, setExpanded] = useState(false);
    const [overflowing, setOverflowing] = useState(false);

    useEffect(() => {
        const el = ref.current!;
        const measure = () => {
            if (!expanded) setOverflowing(el.scrollHeight > el.clientHeight);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [expanded]);

    return (
        <div className="mt-4 flex flex-col items-start gap-1">
            <p
                ref={ref}
                className={cn(
                    'text-sm leading-relaxed wrap-anywhere whitespace-pre-line text-muted-foreground',
                    !expanded && 'line-clamp-3'
                )}
            >
                {truncateProfileBio(text)}
            </p>
            {(overflowing || expanded) && (
                <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    aria-expanded={expanded}
                    className="text-sm font-medium text-primary"
                >
                    {expanded ? 'Ler menos' : 'Ler mais'}
                </button>
            )}
        </div>
    );
}

function RegistrationCopy({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
        } catch {
            return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const label = copied ? 'Copiado' : 'Copiar matrícula';
    const Icon = copied ? Check : IdCard;

    return (
        <button
            type="button"
            onClick={copy}
            aria-label={label}
            title={label}
            className={cn(
                'mt-0.5 inline-flex items-center gap-1 text-sm leading-none tabular-nums',
                copied ? 'text-primary' : 'text-muted-foreground'
            )}
        >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span>{value}</span>
        </button>
    );
}
