import { Check, IdCard } from 'lucide-react';
import { useState } from 'react';

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
                        {titleCase(user.course)} · {user.unity}
                    </p>
                    <p className="text-xs font-medium text-muted-foreground">{user.level}</p>
                </div>
            </div>
            {user.bio && (
                <p className="mt-4 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                    {user.bio}
                </p>
            )}
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
        { label: 'CH. Obrigatória Pendente', hours: workload.pending_mandatory, credits: true },
        { label: 'CH. Optativa Pendente', hours: workload.pending_optional, credits: true },
        {
            label: 'CH. Complementar Pendente',
            hours: workload.pending_complementary,
            credits: true
        },
        { label: 'CH. Total Currículo', hours: workload.total }
    ];

    return (
        <ProfileSection title="Progresso">
            <ListCard>
                {items && (
                    <dl className="divide-y divide-border">
                        {items.map(({ label, hours, credits }) => (
                            <div
                                key={label}
                                className="flex min-h-12 items-center justify-between gap-2 py-2.5"
                            >
                                <dt className="text-sm font-medium">{label}</dt>
                                <dd className="text-sm font-semibold text-primary tabular-nums">
                                    {hours}h
                                    {credits && hours > 0 && (
                                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                            ({creditsLabel(hours)})
                                        </span>
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                )}
                {integralization != null && (
                    <Meter label="Integralização" value={integralization} />
                )}
            </ListCard>
        </ProfileSection>
    );
}

export function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="mt-6" aria-label={title}>
            <h2 className="mb-2 px-1 text-sm font-semibold">{title}</h2>
            {children}
        </section>
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
