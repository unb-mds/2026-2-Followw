import { X } from 'lucide-react';

import type { CatalogSubject, SubjectClassroom } from '#/queries/subjects';

import { AddToSchedule } from '#/components/schedule/AddToSchedule';
import { Seats } from '#/components/search/Seats';
import { TurmaDetails } from '#/components/search/TurmaDetails';
import { Button } from '#/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '#/components/ui/dialog';
import { titleCase } from '#/lib/profile';
import { describeSchedule } from '#/lib/schedule';
import { cn } from '#/lib/shadcn';

export interface TurmaProps {
    subject: CatalogSubject;
    classroom: SubjectClassroom;
    prerequisitesMet: boolean | null;
}

export function TurmaCard({
    subject,
    classroom,
    prerequisitesMet,
    onOpenDetails
}: TurmaProps & { onOpenDetails?: () => void }) {
    const professors = classroom.professors.map(({ name }) => titleCase(name)).join(', ');

    return (
        <Dialog onOpenChange={(open) => open && onOpenDetails?.()}>
            <div className="relative flex items-center gap-3 px-3 py-2.5">
                <DialogTrigger
                    render={
                        <Button
                            variant="ghost"
                            className="absolute inset-0 h-full w-full rounded-none hover:bg-primary/5 focus-visible:ring-inset"
                        />
                    }
                    aria-label={`Detalhes da turma ${classroom.number}`}
                />
                <span className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground tabular-nums">
                        <span className="font-semibold text-primary">
                            {describeSchedule(classroom.schedule) ?? 'Horário a definir'}
                        </span>
                        {` · ${classroom.room ?? 'Local não informado'} · T${classroom.number}`}
                    </span>
                    <span
                        className={cn(
                            'line-clamp-2 text-sm leading-snug',
                            professors ? 'font-semibold text-foreground' : 'text-muted-foreground'
                        )}
                    >
                        {professors || 'Docentes não informados'}
                    </span>
                </span>
                <span className="pointer-events-none relative">
                    <Seats classroom={classroom} />
                </span>
                <span className="relative shrink-0">
                    <AddToSchedule subject={subject} classroom={classroom} />
                </span>
            </div>
            <DialogContent
                className="max-h-9/10 overflow-y-auto rounded-2xl sm:max-w-lg"
                showCloseButton={false}
            >
                <div className="flex items-start gap-3">
                    <DialogHeader className="min-w-0 flex-1">
                        <DialogDescription className="text-xs">
                            {subject.code} · Turma {classroom.number} · {classroom.semester}
                        </DialogDescription>
                        <DialogTitle className="text-lg leading-snug font-semibold">
                            {subject.name}
                        </DialogTitle>
                    </DialogHeader>
                    <DialogClose
                        render={<Button variant="ghost" size="icon-lg" />}
                        aria-label="Fechar detalhes da turma"
                    >
                        <X className="size-5" aria-hidden="true" />
                    </DialogClose>
                </div>
                <TurmaDetails
                    subject={subject}
                    classroom={classroom}
                    prerequisitesMet={prerequisitesMet}
                />
            </DialogContent>
        </Dialog>
    );
}
