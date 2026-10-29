import { X } from 'lucide-react';

import type { CatalogSubject, SubjectClassroom } from '#/queries/subjects';

import { ClassCard } from '#/components/home/ClassCard';
import { AddToSchedule } from '#/components/schedule/AddToSchedule';
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
import { describeSchedule } from '#/lib/schedule';

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
    return (
        <Dialog onOpenChange={(open) => open && onOpenDetails?.()}>
            <ClassCard
                variant="row"
                title={subject.name}
                code={subject.code}
                classNumber={classroom.number}
                time={describeSchedule(classroom.schedule) ?? 'Horário a definir'}
                location={classroom.room ?? 'Local não informado'}
                professors={classroom.professors}
                buttonRender={<DialogTrigger />}
                action={<AddToSchedule subject={subject} classroom={classroom} />}
            />
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
