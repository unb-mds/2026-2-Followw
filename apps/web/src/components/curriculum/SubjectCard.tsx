import type { FlowNode } from '#/lib/curriculum/geometry';
import type { AcademicState, CurriculumModel } from '#/lib/curriculum/model';

import { SubjectDetails } from '#/components/curriculum/SubjectDetails';
import { Dialog, DialogContent, DialogTrigger } from '#/components/ui/dialog';
import { creditText, hoursText, stateLabels } from '#/lib/curriculum/model';
import { titleCase } from '#/lib/profile';
import { cn } from '#/lib/shadcn';

export const stateStyles: Record<AcademicState, string> = {
    completed: 'border-success/30 bg-success/10 text-foreground',
    enrolled: 'border-info/30 bg-info/10 text-foreground',
    overdue: 'border-destructive/30 bg-destructive/10 text-foreground',
    pending: 'border-border bg-muted text-foreground',
    unknown: 'border-dashed border-border bg-background text-foreground'
};

export function SubjectCard({
    node,
    model,
    state,
    selected,
    mobile,
    onHover
}: {
    node: FlowNode;
    model: CurriculumModel;
    state: AcademicState | null;
    selected: boolean;
    mobile: boolean;
    onHover?: (code: string | null) => void;
}) {
    const subject = node.subject;
    const name = titleCase(subject.name ?? 'Nome indisponível');
    function highlight(event: React.PointerEvent) {
        if (event.pointerType !== 'touch') onHover?.(subject.code);
    }
    return (
        <Dialog>
            <DialogTrigger
                onPointerEnter={highlight}
                onPointerMove={highlight}
                onPointerLeave={() => onHover?.(null)}
                onPointerCancel={() => onHover?.(null)}
                style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
                className={cn(
                    'absolute flex flex-col border text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary',
                    mobile ? 'gap-0.5 rounded-xl px-3 py-2' : 'gap-1 rounded-lg p-3',
                    stateStyles[state ?? 'pending'],
                    selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                )}
                aria-label={`${subject.code}, ${name}${state ? `, ${stateLabels[state]}` : ''}${selected ? ', matéria selecionada' : ''}. Ver requisitos`}
            >
                <span className="text-xs text-muted-foreground">{subject.code}</span>
                <span
                    title={name}
                    className={cn(
                        'font-bold wrap-anywhere',
                        mobile ? 'line-clamp-3 text-sm leading-4' : 'line-clamp-3 text-xs leading-4'
                    )}
                >
                    {name}
                </span>
                <span className="mt-auto max-w-full self-end text-right text-xs text-muted-foreground">
                    {hoursText(subject.hours)} ·{' '}
                    {creditText(subject.hours, mobile ? 'long' : 'short')}
                </span>
            </DialogTrigger>
            <DialogContent showCloseButton={false} className="max-h-dvh overflow-y-auto">
                <SubjectDetails subject={subject} model={model} state={state} />
            </DialogContent>
        </Dialog>
    );
}
