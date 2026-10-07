import { Check, Copy, IdCard, Mail } from 'lucide-react';
import { useState } from 'react';

import type { components } from '#/queries/schema.gen';

import { ListCard, Meter } from '#/components/ListCard';
import { Button } from '#/components/ui/button';
import { Card } from '#/components/ui/card';
import { PersonPhoto } from '#/components/ui/person-photo';
import { academicIndexes, titleCase } from '#/lib/profile';
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
                    <h1 className="mt-1 text-xl leading-tight font-semibold tracking-tight text-balance">
                        {displayName || titleCase(user.name)}
                    </h1>
                    <p className="mt-1 text-sm text-primary">
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
    if (indexes.length === 0 && user.integralization == null) return null;

    return (
        <ProfileSection title="Desempenho">
            <Card size="sm" className="gap-0 py-0">
                {indexes.length > 0 && (
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
                )}
                {user.integralization != null && (
                    <Meter
                        label="Integralização"
                        value={user.integralization}
                        className="border-t border-border px-3 first:border-t-0"
                    />
                )}
            </Card>
        </ProfileSection>
    );
}

export function EnrollmentDetails({ user }: { user: UserProfile }) {
    return (
        <ProfileSection title="Vínculo">
            <ListCard>
                <ProfileRow icon={IdCard} label="Matrícula">
                    <span className="tabular-nums">{user.registration}</span>
                    <CopyButton value={user.registration} label="matrícula" />
                </ProfileRow>
                {user.email && (
                    <ProfileRow icon={Mail} label="E-mail">
                        <a href={`mailto:${user.email}`} className="min-w-0 break-all text-primary">
                            {user.email}
                        </a>
                        <CopyButton value={user.email} label="e-mail" />
                    </ProfileRow>
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

function ProfileRow({
    icon: Icon,
    label,
    children
}: {
    icon: React.FC<{ className?: string }>;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-12 items-center gap-3 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{label}</p>
                <div className="flex items-center justify-between gap-2 text-sm font-medium">
                    {children}
                </div>
            </div>
        </div>
    );
}

function CopyButton({ value, label }: { value: string; label: string }) {
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

    return (
        <Button
            variant="ghost"
            size="icon-sm"
            onClick={copy}
            aria-label={copied ? 'Copiado' : `Copiar ${label}`}
            title={copied ? 'Copiado' : `Copiar ${label}`}
            className={copied ? 'text-primary' : 'text-muted-foreground'}
        >
            {copied ? <Check /> : <Copy />}
        </Button>
    );
}
