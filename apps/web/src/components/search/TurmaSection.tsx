import type { CatalogSubject } from '@followw/core/queries/subjects.ts';

import { m } from 'motion/react';
import { useState, type ReactNode } from 'react';

import { repeat, SectionHeaderSkeleton } from '#/components/LoadingSkeleton';
import { TurmaItem } from '#/components/search/TurmaItem';
import { Accordion } from '#/components/ui/accordion';
import { Button } from '#/components/ui/button';
import { Skeleton } from '#/components/ui/skeleton';
import { rise, useEntrance } from '#/lib/motion';

const PAGE_SIZE = 25;

export function TurmaSection({
    title,
    subjects,
    taken,
    onOpenDetails,
    currentPeriod,
    footer
}: {
    currentPeriod?: number | null;
    title?: string;
    subjects: CatalogSubject[];
    taken?: Set<string> | null;
    onOpenDetails?: () => void;
    footer?: (subject: CatalogSubject) => ReactNode;
}) {
    const [limit, setLimit] = useState(PAGE_SIZE);
    const entrance = useEntrance();
    if (subjects.length === 0) return null;

    return (
        <section className="flex flex-col gap-3">
            {title && (
                <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-base font-bold text-foreground">{title}</h2>
                    <span className="shrink-0 text-xs text-muted-foreground">
                        {`${subjects.length} ${subjects.length === 1 ? 'resultado' : 'resultados'}`}
                    </span>
                </div>
            )}
            <Accordion multiple className="gap-2" render={<m.div {...entrance} />}>
                {subjects.slice(0, limit).map((subject, index) => (
                    <TurmaItem
                        key={subject.code}
                        animation={<m.div custom={index % PAGE_SIZE} variants={rise} />}
                        subject={subject}
                        currentPeriod={currentPeriod}
                        taken={taken}
                        onOpenDetails={onOpenDetails}
                        footer={footer?.(subject)}
                    />
                ))}
            </Accordion>
            {subjects.length > limit && (
                <Button
                    variant="outline"
                    className="self-center"
                    onClick={() => setLimit(limit + PAGE_SIZE)}
                >
                    Mostrar mais
                </Button>
            )}
        </section>
    );
}

export function TurmaSectionSkeleton({ title = false }: { title?: boolean }) {
    return (
        <div className="flex flex-col gap-3">
            {title && <SectionHeaderSkeleton />}
            <div className="flex flex-col gap-2">
                {repeat(5, () => (
                    <div className="flex items-center gap-3 rounded-2xl border bg-card px-3 py-3 lg:px-5 lg:py-4">
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-4 w-3/4 lg:h-6" />
                        </div>
                        <Skeleton className="h-3 w-12 shrink-0" />
                    </div>
                ))}
            </div>
        </div>
    );
}
