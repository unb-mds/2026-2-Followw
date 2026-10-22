import { Check, IdCard } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { components } from '#/queries/schema.gen';

import { ListCard, Meter } from '#/components/ListCard';
import { Card } from '#/components/ui/card';
import { PersonPhoto } from '#/components/ui/person-photo';
import { academicIndexes, creditsLabel, titleCase } from '#/lib/profile';
import { cn } from '#/lib/shadcn';

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
                <div className="min-w-0">
                    <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance">
                        {displayName || titleCase(user.name)}
                    </h1>
                    <RegistrationCopy value={user.registration} />
                    <p className="mt-2 text-sm text-primary">
                        {[user.course && titleCase(user.course), user.unity]
                            .filter(Boolean)
                            .join(' · ')}
                    </p>
                    <p className="text-xs font-medium text-muted-foreground">{user.level}</p>
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
            <Card size="sm" className="gap-0 py-0">
                <dl
                    className={cn(
                        'grid divide-x divide-border',
                        indexes.length > 1 && 'grid-cols-2'
                    )}
                >
                    {indexes.map((index) => (
                        <div key={index.label} className="px-3 py-3">
                            <dt className="text-xs font-medium text-muted-foreground">
                                <abbr title={index.description} className="no-underline">
                                    {index.label}
                                </abbr>
                            </dt>
                            <dd className="mt-1 text-2xl font-semibold tracking-tight text-primary tabular-nums">
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
    const { integralization, workload } = user;
    if (integralization == null && !workload) return null;

    const items = workload && [
        { label: 'Obrigatória pendente', hours: workload.pending_mandatory, credits: true },
        { label: 'Optativa pendente', hours: workload.pending_optional, credits: true },
        { label: 'Complementar pendente', hours: workload.pending_complementary, credits: true },
        { label: 'Total do currículo', hours: workload.total, credits: true }
    ];

    return (
        <ProfileSection title="Progresso">
            <ListCard>
                {integralization != null && (
                    <Meter label="Integralização" value={integralization} />
                )}
                {items && (
                    <dl className="flex flex-col gap-3 py-3">
                        {items.map(({ label, hours, credits }) => (
                            <div key={label} className="flex items-baseline justify-between gap-2">
                                <dt className="text-sm text-muted-foreground">{label}</dt>
                                <dd className="text-sm font-medium tabular-nums">
                                    {hours}h
                                    {credits && hours > 0 && (
                                        <span className="text-muted-foreground">
                                            {' · '}
                                            {creditsLabel(hours)}
                                        </span>
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                )}
            </ListCard>
        </ProfileSection>
    );
}

export function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section aria-label={title}>
            <h2 className="mb-2 px-1 text-sm font-semibold">{title}</h2>
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
                    'text-sm leading-relaxed whitespace-pre-line text-muted-foreground',
                    !expanded && 'line-clamp-3'
                )}
            >
                {text}
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
                'mt-0.5 flex items-center gap-1 text-sm tabular-nums',
                copied ? 'text-primary' : 'text-muted-foreground'
            )}
        >
            <Icon className="size-3" />
            {value}
        </button>
    );
}
