import { CircleCheck, CircleDashed, CircleX } from 'lucide-react';

import type { ManualAttendanceEntry } from '#/queries/classrooms';
import type { components } from '#/queries/schema.gen';

import { ListCard, Meter } from '#/components/ListCard';
import { Card, CardContent } from '#/components/ui/card';
import {
    formatClassroomDate,
    formatClassroomWeekday,
    frequencyTone
} from '#/lib/classroom-details';
import { cn } from '#/lib/shadcn';

type Frequency = components['schemas']['ClassroomFrequencyView'];
type Entry = components['schemas']['AttendanceEntry'];
type ManualStatus = ManualAttendanceEntry['status'];
type DisplayEntry = {
    occurred_on: string;
    position: number;
    official?: Entry;
    manual?: ManualAttendanceEntry;
};

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

const MANUAL_VIEW = {
    presente: { icon: CircleCheck, color: 'text-primary', label: 'Presente' },
    ausente: { icon: CircleX, color: 'text-destructive', label: 'Ausente' },
    cancelada: { icon: CircleDashed, color: 'text-muted-foreground', label: 'Aula cancelada' }
} as const;
const EMPTY_MANUAL: ManualAttendanceEntry[] = [];
const NEXT_MANUAL_STATUS: Record<ManualStatus, ManualStatus | null> = {
    presente: 'ausente',
    ausente: 'cancelada',
    cancelada: null
};

function nextManualStatus(status?: ManualStatus): ManualStatus | null {
    return status ? NEXT_MANUAL_STATUS[status] : 'presente';
}

function displayEntries(official: Entry[], manual: ManualAttendanceEntry[]): DisplayEntry[] {
    const entries = new Map<string, DisplayEntry>();
    const positions = new Map<string, number>();
    for (const entry of official) {
        const position = positions.get(entry.occurred_on) ?? 0;
        positions.set(entry.occurred_on, position + 1);
        entries.set(`${entry.occurred_on}:${position}`, {
            occurred_on: entry.occurred_on,
            position,
            official: entry
        });
    }
    for (const entry of manual) {
        const key = `${entry.occurred_on}:${entry.position}`;
        const current = entries.get(key);
        if (current?.official?.status === 'presente' || current?.official?.status === 'falta') {
            continue;
        }
        entries.set(key, {
            ...current,
            occurred_on: entry.occurred_on,
            position: entry.position,
            manual: entry
        });
    }
    return [...entries.values()].toSorted(
        (a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.position - a.position
    );
}

export function FrequencyContent({
    data,
    manualEntries = EMPTY_MANUAL,
    onSave,
    onRemove,
    pending = false
}: {
    data: Frequency;
    manualEntries?: ManualAttendanceEntry[];
    onSave?: (entry: ManualAttendanceEntry) => Promise<unknown>;
    onRemove?: (entry: ManualAttendanceEntry) => Promise<unknown>;
    pending?: boolean;
}) {
    const attendance = data.frequency;
    const summary = attendance?.summary;
    const registered = data.frequency_status !== 'not_registered';
    const entries = displayEntries(
        [...(attendance?.entries ?? []), ...(data.unregistered_entries ?? [])],
        manualEntries
    );
    const manualPresent = entries.filter((entry) => entry.manual?.status === 'presente').length;
    const manualAbsent = entries.filter((entry) => entry.manual?.status === 'ausente').length;
    const presences =
        (summary?.recorded_entries ?? 0) - (summary?.absence_entries ?? 0) + manualPresent;
    const absences = (summary?.total_absences ?? 0) + manualAbsent;
    const manualRecorded = manualPresent + manualAbsent;
    const registeredLessons = (attendance?.registered ?? 0) + manualRecorded;
    const percentage = manualRecorded
        ? (((attendance?.attended ?? 0) + manualPresent) / registeredLessons) * 100
        : (attendance?.registered_percentage ?? 0);
    function toggle(entry: DisplayEntry) {
        const status = nextManualStatus(entry.manual?.status);
        if (status === null && entry.manual) {
            void onRemove?.(entry.manual).catch(() => {});
        } else if (status && onSave) {
            void onSave({
                occurred_on: entry.occurred_on,
                position: entry.position,
                status,
                manual: true
            }).catch(() => {});
        }
    }

    return (
        <div className="flex flex-col gap-2">
            <ListCard>
                <Meter
                    label="Andamento das aulas"
                    value={data.progress.percentage}
                    detail={`${data.progress.taught}h ministradas de ${data.progress.total}h`}
                />
            </ListCard>
            {!registered && (
                <Card size="sm">
                    <CardContent className="text-center text-sm text-muted-foreground">
                        A frequência ainda não foi lançada pelo professor.
                    </CardContent>
                </Card>
            )}
            {((summary?.recorded_entries ?? 0) > 0 || manualRecorded > 0) && (
                <Card size="sm" className="gap-0 py-0">
                    <dl className="grid grid-cols-3 divide-x divide-border">
                        <Stat label="Presenças" value={presences} />
                        <Stat
                            label="Faltas"
                            value={absences}
                            className={absences > 0 ? 'text-destructive' : undefined}
                        />
                        <Stat
                            label="Frequência"
                            value={`${Number(percentage.toFixed(1)).toLocaleString('pt-BR')}%`}
                            className={FREQUENCY_TONE[frequencyTone(percentage)]}
                        />
                    </dl>
                </Card>
            )}
            {manualRecorded > 0 && (
                <p className="px-1 text-xs text-muted-foreground">
                    Frequência estimada com as aulas marcadas por você.
                </p>
            )}
            {data.frequency_status === 'partially_registered' && (
                <p className="px-1 text-xs text-muted-foreground">
                    Há aulas publicadas cuja frequência ainda não foi registrada.
                </p>
            )}
            {entries.length > 0 && (
                <section>
                    <h3 className="mb-2 px-1 text-sm font-semibold">
                        Aulas{' '}
                        <span className="font-normal text-muted-foreground">{entries.length}</span>
                    </h3>
                    <ListCard>
                        {entries.map((entry) => {
                            const view = entry.manual
                                ? MANUAL_VIEW[entry.manual.status]
                                : ENTRY_VIEW[entry.official!.status];
                            const editable =
                                !entry.official || entry.official.status === 'nao_registrada';
                            const label =
                                typeof view.label === 'function'
                                    ? view.label(entry.official!)
                                    : view.label;
                            const nextStatus = nextManualStatus(entry.manual?.status);
                            const nextLabel = nextStatus
                                ? MANUAL_VIEW[nextStatus].label.toLowerCase()
                                : 'não marcada';
                            return (
                                <div
                                    key={`${entry.occurred_on}:${entry.position}`}
                                    className="flex flex-wrap items-center gap-2 py-2.5 text-sm"
                                >
                                    {editable && onSave && onRemove ? (
                                        <button
                                            type="button"
                                            aria-label={`Situação de ${formatClassroomDate(entry.occurred_on)}, aula ${entry.position + 1}: ${label}. Alterar para ${nextLabel}.`}
                                            title={`Alterar para ${nextLabel}`}
                                            disabled={pending}
                                            onClick={() => toggle(entry)}
                                            className="relative flex size-4 shrink-0 items-center justify-center rounded-full after:absolute after:-inset-2 after:rounded-full hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                                        >
                                            <view.icon
                                                className={cn('size-4', view.color)}
                                                aria-hidden
                                            />
                                        </button>
                                    ) : (
                                        <view.icon
                                            className={cn('size-4 shrink-0', view.color)}
                                            aria-hidden
                                        />
                                    )}
                                    <span className="tabular-nums">
                                        {formatClassroomDate(entry.occurred_on)}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {formatClassroomWeekday(entry.occurred_on)}
                                    </span>
                                    {entries.filter(
                                        (item) => item.occurred_on === entry.occurred_on
                                    ).length > 1 && (
                                        <span className="text-xs text-muted-foreground">
                                            Aula {entry.position + 1}
                                        </span>
                                    )}
                                    <span className={cn('ml-auto text-xs font-medium', view.color)}>
                                        {label}
                                    </span>
                                </div>
                            );
                        })}
                    </ListCard>
                </section>
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
