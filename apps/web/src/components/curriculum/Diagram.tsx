import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { AcademicState, CurriculumModel, FlowSubject } from '#/lib/curriculum/types';

import { Connections } from '#/components/curriculum/Connections';
import { SubjectCard } from '#/components/curriculum/SubjectCard';
import { Button } from '#/components/ui/button';
import { DESKTOP, layoutCurriculum, MOBILE, type LayoutMetrics } from '#/lib/curriculum/geometry';
import { relatedEdgeIds } from '#/lib/curriculum/relations';
import { useWidth } from '#/lib/width';

export interface DiagramProps {
    model: CurriculumModel;
    selected?: string;
    // ausente fora do curso do aluno
    state?: (subject: FlowSubject) => AcademicState;
}

function Canvas({
    model,
    selected,
    state,
    periods,
    metrics,
    label
}: DiagramProps & { periods: number[]; metrics: LayoutMetrics; label: string }) {
    const { ref, width } = useWidth<HTMLElement>();
    const [active, setActive] = useState<string | null>(null);
    const visibleEdges = useMemo(
        () => (active ? relatedEdgeIds(model.edges, active) : null),
        [model, active]
    );
    const geometry = useMemo(
        () => layoutCurriculum(model, width, metrics, periods),
        [model, width, metrics, periods]
    );
    const revealed = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (!width || !selected || revealed.current === selected) return;
        const node = geometry.nodes.find((item) => item.subject.code === selected);
        if (!node || !ref.current) return;
        ref.current.scrollTo({
            left: Math.max(0, node.x - (width - node.width) / 2),
            top: Math.max(0, node.y - (ref.current.clientHeight - node.height) / 2)
        });
        revealed.current = selected;
    }, [geometry, ref, selected, width]);
    return (
        <section
            ref={ref}
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Região rolável deve receber navegação por teclado.
            tabIndex={0}
            aria-label={label}
            className="min-h-0 flex-1 overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-primary"
        >
            {width > 0 && (
                <div
                    className="relative"
                    style={{ width: geometry.width, height: geometry.height }}
                >
                    <Connections model={model} geometry={geometry} visibleEdges={visibleEdges} />
                    {geometry.headings.map(({ period, x }) => (
                        <h2
                            key={period}
                            className="absolute top-2 -translate-x-1/2 text-center text-sm font-bold whitespace-nowrap"
                            style={{ left: x }}
                        >
                            {period}º semestre
                        </h2>
                    ))}
                    {geometry.nodes.map((node) => (
                        <SubjectCard
                            key={node.subject.code}
                            node={node}
                            state={state?.(node.subject)}
                            unlocks={model.unlocks.get(node.subject.code)}
                            selected={
                                selected === node.subject.code || active === node.subject.code
                            }
                            compact={metrics.compact}
                            onHover={setActive}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

export function DesktopDiagram(props: DiagramProps) {
    return (
        <Canvas
            {...props}
            periods={props.model.periods}
            metrics={DESKTOP}
            label="Fluxo acadêmico por semestres, área de rolagem"
        />
    );
}

export function MobileDiagram({
    initialPeriod,
    ...props
}: DiagramProps & { initialPeriod: number }) {
    const { periods } = props.model;
    const [index, setIndex] = useState(() => Math.max(0, periods.indexOf(initialPeriod)));
    const period = periods[index];
    const visible = useMemo(() => [period], [period]);
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="mx-4 mb-2 flex shrink-0 items-center justify-between gap-4 rounded-xl bg-muted/60 p-1">
                <Button
                    variant="outline"
                    size="icon"
                    className="size-9"
                    aria-label="Semestre anterior"
                    disabled={index === 0}
                    onClick={() => setIndex((current) => Math.max(0, current - 1))}
                >
                    <ChevronLeft />
                </Button>
                <h2 className="text-base font-semibold" aria-live="polite">
                    {period}º semestre
                </h2>
                <Button
                    variant="outline"
                    size="icon"
                    className="size-9"
                    aria-label="Próximo semestre"
                    disabled={index === periods.length - 1}
                    onClick={() => setIndex((current) => Math.min(periods.length - 1, current + 1))}
                >
                    <ChevronRight />
                </Button>
            </div>
            {/* remontar por semestre volta a rolagem ao topo */}
            <Canvas
                key={period}
                {...props}
                periods={visible}
                metrics={MOBILE}
                label={`Disciplinas do ${period}º semestre`}
            />
        </div>
    );
}
