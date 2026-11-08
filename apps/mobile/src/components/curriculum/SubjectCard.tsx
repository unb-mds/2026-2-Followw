import type { AcademicState, FlowNode, FlowSubject } from '@followw/core/lib/curriculum/types.ts';

import { creditText, hoursText } from '@followw/core/lib/curriculum/format.ts';
import { stateLabels } from '@followw/core/lib/curriculum/model.ts';
import { titleCase } from '@followw/core/lib/profile.ts';
import { Pressable, ScrollView, useWindowDimensions } from 'react-native';

import { SubjectDetails } from '@/components/curriculum/SubjectDetails';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const stateStyles: Record<AcademicState, string> = {
    completed: 'border-success/30 bg-success/10',
    enrolled: 'border-info/30 bg-info/10',
    overdue: 'border-destructive/30 bg-destructive/10',
    pending: 'border-border bg-muted',
    unknown: 'border-dashed border-border bg-background'
};

export function SubjectCard({
    node,
    state,
    unlocks,
    selected,
    compact,
    onHighlight
}: {
    node: FlowNode;
    unlocks?: FlowSubject[];
    // ausente fora do curso do aluno
    state?: AcademicState;
    selected: boolean;
    compact: boolean;
    // toque longo destaca as ligações da matéria, no lugar do hover do web
    onHighlight: (code: string) => void;
}) {
    const { height } = useWindowDimensions();
    const subject = node.subject;
    const name = titleCase(subject.name);
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Pressable
                    accessibilityLabel={`${subject.code}, ${name}${state ? `, ${stateLabels[state]}` : ''}${selected ? ', matéria selecionada' : ''}. Ver requisitos`}
                    onLongPress={() => onHighlight(subject.code)}
                    style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
                    className={cn(
                        'absolute border active:opacity-70',
                        compact ? 'gap-1 rounded-lg p-3' : 'gap-0.5 rounded-xl px-3 py-2',
                        stateStyles[state ?? 'pending'],
                        selected && 'border-2 border-primary'
                    )}
                >
                    <Text className="text-xs font-normal text-muted-foreground">
                        {subject.code}
                    </Text>
                    <Text
                        numberOfLines={3}
                        className={cn(
                            'font-bold',
                            compact ? 'text-xs' : 'text-sm',
                            // depois do tamanho, senão o cn descarta
                            'leading-4'
                        )}
                    >
                        {name}
                    </Text>
                    <Text className="mt-auto max-w-full self-end text-right text-xs font-normal text-muted-foreground">
                        {hoursText(subject.hours)} ·{' '}
                        {creditText(subject.hours, compact ? 'short' : 'long')}
                    </Text>
                </Pressable>
            </DialogTrigger>
            <DialogContent showCloseButton={false}>
                <ScrollView
                    style={{ maxHeight: height * 0.8 }}
                    contentContainerClassName="gap-4"
                    showsVerticalScrollIndicator={false}
                >
                    <SubjectDetails subject={subject} state={state} unlocks={unlocks} />
                </ScrollView>
            </DialogContent>
        </Dialog>
    );
}
