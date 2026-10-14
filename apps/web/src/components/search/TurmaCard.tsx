import { Lock, X } from 'lucide-react';

import type { TurmaBusca } from '#/queries/search-classrooms';

import { ClassCard } from '#/components/home/ClassCard';
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
import { lockedReasons } from '#/queries/search-classrooms';

export function TurmaCard({
    turma,
    prerequisitesMet = turma.prerequisites_met ?? null
}: {
    turma: TurmaBusca;
    prerequisitesMet?: boolean | null;
}) {
    const reasons = lockedReasons(turma, prerequisitesMet);

    return (
        <Dialog>
            <ClassCard
                variant="row"
                title={turma.subject.name}
                code={turma.subject.code}
                classNumber={turma.number}
                time={describeSchedule(turma.schedule) ?? 'Horário a definir'}
                location={turma.room ?? 'Local não informado'}
                professors={turma.professors}
                buttonRender={<DialogTrigger />}
                indicator={
                    reasons.length > 0 && (
                        <Lock
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-label={reasons.join('. ')}
                        />
                    )
                }
            />
            <DialogContent
                className="max-h-9/10 overflow-y-auto rounded-2xl sm:max-w-lg"
                showCloseButton={false}
            >
                <div className="flex items-start gap-3">
                    <DialogHeader className="min-w-0 flex-1">
                        <DialogDescription className="text-xs">
                            {turma.subject.code} · Turma {turma.number} · {turma.semester}
                        </DialogDescription>
                        <DialogTitle className="text-lg leading-snug font-semibold">
                            {turma.subject.name}
                        </DialogTitle>
                    </DialogHeader>
                    <DialogClose
                        render={<Button variant="ghost" size="icon-lg" />}
                        aria-label="Fechar detalhes da turma"
                    >
                        <X className="size-5" aria-hidden="true" />
                    </DialogClose>
                </div>
                <TurmaDetails turma={turma} prerequisitesMet={prerequisitesMet} />
            </DialogContent>
        </Dialog>
    );
}
