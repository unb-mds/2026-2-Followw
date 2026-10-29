import { Building2, ExternalLink, Globe, Mail } from 'lucide-react';

import type { ProfessorDetails } from '#/queries/professors';

import { buttonVariants } from '#/components/ui/button';
import { PersonPhoto } from '#/components/ui/person-photo';
import { mailto } from '#/lib/contact';
import { titleCase, unitLabel } from '#/lib/profile';
import { cn } from '#/lib/shadcn';

export function ProfessorHeader({ professor }: { professor: ProfessorDetails }) {
    const label = unitLabel(professor.unit);

    return (
        <div className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card ring-1 ring-foreground/8">
            <div className="flex items-start gap-4">
                <PersonPhoto src={professor.photo} size="lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <h1 className="text-xl leading-tight font-semibold tracking-tight text-balance text-foreground">
                        {titleCase(professor.name)}
                    </h1>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{label}</span>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-1">
                {professor.email && (
                    <a
                        href={mailto(professor.email)}
                        className={cn(
                            buttonVariants({ variant: 'outline', size: 'sm' }),
                            'gap-1.5 text-xs'
                        )}
                    >
                        <Mail className="size-3.5 text-primary" aria-hidden="true" />
                        <span className="max-w-48 truncate">{professor.email}</span>
                    </a>
                )}
                {professor.lattes && (
                    <a
                        href={professor.lattes}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                            buttonVariants({ variant: 'outline', size: 'sm' }),
                            'gap-1.5 text-xs'
                        )}
                    >
                        <Globe className="size-3.5 text-primary" aria-hidden="true" />
                        <span>Currículo Lattes</span>
                        <ExternalLink className="size-3 text-muted-foreground" aria-hidden="true" />
                    </a>
                )}
                {professor.url && (
                    <a
                        href={professor.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                            buttonVariants({ variant: 'ghost', size: 'sm' }),
                            'gap-1.5 text-xs text-muted-foreground'
                        )}
                    >
                        <span>SIGAA</span>
                        <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                )}
            </div>
        </div>
    );
}
