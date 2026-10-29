import { ArrowUpRight, Building2, Mail } from 'lucide-react';

import type { ProfessorDetails } from '#/queries/professors';

import { PersonPhoto } from '#/components/ui/person-photo';
import { mailto } from '#/lib/contact';
import { titleCase, unitLabel } from '#/lib/profile';
import { cn } from '#/lib/shadcn';

export function ProfessorHeader({ professor }: { professor: ProfessorDetails }) {
    return (
        <div className="flex animate-in items-stretch gap-4 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/8 duration-500 fade-in slide-in-from-bottom-2 sm:gap-5 sm:p-5">
            <div className="shrink-0 rounded-xl bg-background/60 p-1 shadow-card ring-1 ring-primary/20">
                <PersonPhoto src={professor.photo} size="xl" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 py-1">
                <div className="flex flex-col gap-1">
                    <h1 className="text-xl leading-tight font-semibold tracking-tight text-balance text-foreground sm:text-2xl">
                        {titleCase(professor.name)}
                    </h1>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{unitLabel(professor.unit)}</span>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {professor.email && (
                        <a
                            href={mailto(professor.email)}
                            className="flex max-w-full min-w-0 items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary ring-1 ring-primary/20 transition-colors hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                            <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{professor.email}</span>
                        </a>
                    )}
                    {professor.lattes && (
                        <ExternalLink href={professor.lattes}>Lattes</ExternalLink>
                    )}
                    <ExternalLink href={professor.url}>SIGAA</ExternalLink>
                </div>
            </div>
        </div>
    );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                'group flex items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors',
                'hover:text-primary focus-visible:text-primary focus-visible:outline-none'
            )}
        >
            {children}
            <ArrowUpRight
                className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden="true"
            />
        </a>
    );
}
