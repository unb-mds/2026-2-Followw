import { CircleCheck, CircleDashed, CircleX } from 'lucide-react';

import type { components } from '#/queries/schema.gen';

import { ListCard, Meter } from '#/components/ListCard';
import { Card, CardContent } from '#/components/ui/card';
import {
    formatClassroomDate,
    formatClassroomWeekday,
    frequencyTone
} from '#/lib/classroom-details';
import { cn } from '#/lib/shadcn';

type Frequency = components['schemas']['ClassroomFrequency'];
type Entry = components['schemas']['AttendanceEntry'];

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const FREQUENCY_TONE = {
    ok: undefined,
    warning: 'text-warning',
    danger: 'text-destructive'
} as const;

const ENTRY_VIEW = {
    presente: { icon: CircleCheck, color: 'text-primary', label: () => 'Presença' },
    falta: {
        icon: CircleX,
        color: 'text-destructive',
        label: (entry: Entry) => plural(entry.absences, 'falta', 'faltas')
    },
    nao_registrada: {
        icon: CircleDashed,
        color: 'text-muted-foreground',
        label: () => 'Não registrada'
    }
} as const;

export function FrequencyContent({ data }: { data: Frequency }) {
    const attendance = data.frequency;
    const summary = attendance?.summary;
    const registered = data.frequency_status !== 'not_registered';
    const occurrences = new Map<string, number>();
    // mais recentes primeiro
    const entries = attendance?.entries
        .toSorted((a, b) => b.occurred_on.localeCompare(a.occurred_on))
        .map((entry) => {
            const signature = [entry.occurred_on, entry.status, entry.absences].join('-');
            const occurrence = occurrences.get(signature) ?? 0;
            occurrences.set(signature, occurrence + 1);
            return { entry, key: signature + '-' + occurrence };
        });

    return (
        <div className="flex flex-col gap-2">
            <ListCard>
                <Meter
                    label="Andamento das aulas"
                    value={data.progress.percentage}
                    detail={`${data.progress.taught}h ministradas de ${data.progress.total}h`}
                />
            </ListCard>
            {!registered ? (
                <Card size="sm">
                    <CardContent className="text-center text-sm text-muted-foreground">
                        A frequência ainda não foi lançada pelo professor.
                    </CardContent>
                </Card>
            ) : (
                <>
                    {attendance && summary && (
                        <Card size="sm" className="gap-0 py-0">
                            <dl className="grid grid-cols-3 divide-x divide-border">
                                <Stat
                                    label="Presenças"
                                    value={summary.recorded_entries - summary.absence_entries}
                                />
                                <Stat
                                    label="Faltas"
                                    value={summary.total_absences}
                                    className={
                                        summary.total_absences > 0 ? 'text-destructive' : undefined
                                    }
                                />
                                <Stat
                                    label="Frequência"
                                    value={`${attendance.registered_percentage.toLocaleString('pt-BR')}%`}
                                    className={
                                        FREQUENCY_TONE[
                                            frequencyTone(attendance.registered_percentage)
                                        ]
                                    }
                                />
                            </dl>
                        </Card>
                    )}
                    {data.frequency_status === 'partially_registered' && (
                        <p className="px-1 text-xs text-muted-foreground">
                            Há aulas publicadas cuja frequência ainda não foi registrada.
                        </p>
                    )}
                    {entries && entries.length > 0 && (
                        <section>
                            <h3 className="mb-2 px-1 text-sm font-semibold">
                                Aulas{' '}
                                <span className="font-normal text-muted-foreground">
                                    {entries.length}
                                </span>
                            </h3>
                            <ListCard>
                                {entries.map(({ entry, key }) => {
                                    const view = ENTRY_VIEW[entry.status];
                                    return (
                                        <div
                                            key={key}
                                            className="flex items-center gap-3 py-2.5 text-sm"
                                        >
                                            <view.icon
                                                className={cn('size-4 shrink-0', view.color)}
                                                aria-hidden
                                            />
                                            <span className="tabular-nums">
                                                {formatClassroomDate(entry.occurred_on)}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {formatClassroomWeekday(entry.occurred_on)}
                                            </span>
                                            <span
                                                className={cn(
                                                    'ml-auto text-xs font-medium',
                                                    view.color
                                                )}
                                            >
                                                {view.label(entry)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </ListCard>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}

function Stat({
    label,
    value,
    className
}: {
    label: string;
    value: React.ReactNode;
    className?: string;
}) {
    return (
        <div className="px-3 py-3">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd
                className={cn(
                    'mt-1 text-2xl font-semibold tracking-tight text-primary tabular-nums',
                    className
                )}
            >
                {value}
            </dd>
        </div>
    );
}
