import type { InternshipItem } from '@followw/core/queries/internships.ts';

import { titleCase } from '@followw/core/lib/profile.ts';
import { formatInternshipDate, formatInternshipMoney } from '@followw/core/queries/internships.ts';
import { Briefcase, Calendar, Users } from 'lucide-react';

export function InternshipCard({
    internship,
    onClick
}: {
    internship: InternshipItem;
    onClick: () => void;
}) {
    const stipendFormatted = formatInternshipMoney(internship.stipend);

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={titleCase(internship.title)}
            className="flex w-full cursor-pointer flex-col gap-3 rounded-2xl border bg-card p-4 text-left text-card-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
            <div className="flex items-center gap-2">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Briefcase className="size-5" aria-hidden="true" />
                </div>
                <h3 className="text-sm leading-snug font-semibold">
                    {titleCase(internship.title)}
                </h3>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">
                    {stipendFormatted ? (
                        <span className="text-primary">{stipendFormatted}</span>
                    ) : (
                        <span>Bolsa a combinar</span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <Users className="size-3.5" aria-hidden="true" />
                    <span>
                        {internship.vacancies} {internship.vacancies === 1 ? 'vaga' : 'vagas'}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <Calendar className="size-3.5" aria-hidden="true" />
                    <span>Inscrições até {formatInternshipDate(internship.published_until)}</span>
                </div>
            </div>
        </button>
    );
}
