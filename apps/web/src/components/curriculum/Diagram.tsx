import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { AcademicState, CurriculumModel, FlowSubject } from '#/lib/curriculum/types';

import { Connections } from '#/components/curriculum/Connections';
import { SubjectCard } from '#/components/curriculum/SubjectCard';
import { Button } from '#/components/ui/button';
import { DESKTOP, layoutCurriculum, MOBILE, type LayoutMetrics } from '#/lib/curriculum/geometry';
import { relatedEdgeIds } from '#/lib/curriculum/relations';
import { cn } from '#/lib/shadcn';
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
    metrics,
    label,
    page
}: DiagramProps & {
    metrics: LayoutMetrics;
    label: string;
    // semestre centralizado, só no layout paginado
    page?: { index: number; onChange: (index: number) => void };
}) {
    const { ref, width } = useWidth<HTMLElement>();
    const [active, setActive] = useState<string | null>(null);
    const visibleEdges = useMemo(
        () => (active ? relatedEdgeIds(model.edges, active) : null),
        [model, active]
    );
    const geometry = useMemo(
        () => layoutCurriculum(model, width, metrics),
        [model, width, metrics]
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
    // após a posição inicial, só a rolagem atualiza, para a animação não voltar ao semestre anterior
    const centered = useRef<number | null>(null);
    useEffect(() => {
        const column = page && geometry.columns[page.index];
        if (!width || !column || !ref.current || centered.current === page.index) return;
        const initial = centered.current === null;
        ref.current.scrollTo({
            left: column.x - width / 2,
            behavior: initial ? 'instant' : 'smooth'
        });
        if (initial) centered.current = page.index;
    }, [geometry, page, ref, width]);
    const onScroll = (event: React.UIEvent<HTMLElement>) => {
        if (!page) return;
        const center = event.currentTarget.scrollLeft + width / 2;
        const distances = geometry.columns.map(({ x }) => Math.abs(x - center));
        const index = distances.indexOf(Math.min(...distances));
        if (centered.current === index) return;
        centered.current = index;
        page.onChange(index);
    };
    return (
        <section
            ref={ref}
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Região rolável deve receber navegação por teclado.
            tabIndex={0}
            aria-label={label}
            onScroll={onScroll}
            className={cn(
                'min-h-0 flex-1 overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-primary',
                page && 'snap-x snap-mandatory'
            )}
        >
            {width > 0 && (
                <div
                    className="relative"
                    style={{ width: geometry.width, height: geometry.height }}
                >
                    <Connections model={model} geometry={geometry} visibleEdges={visibleEdges} />
                    {page &&
                        geometry.columns.map(({ period, x }) => (
                            <div
                                key={period}
                                // altura toda para valer em qualquer rolagem vertical
                                className="absolute inset-y-0 w-px snap-center snap-always"
                                style={{ left: x }}
                            />
                        ))}
                    {metrics.headings &&
                        geometry.columns.map(({ period, x }) => (
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
            metrics={DESKTOP}
            label="Fluxo acadêmico por semestres, área de rolagem"
        />
    );
}

export function MobileDiagram({
    initialPeriod,
    ...props
}: DiagramProps & { initialPeriod: number }) {
    const { periods, byCode } = props.model;
    const [index, setIndex] = useState(() =>
        Math.max(0, periods.indexOf(byCode.get(props.selected ?? '')?.period ?? initialPeriod))
    );
    const page = useMemo(() => ({ index, onChange: setIndex }), [index]);
    const period = periods[index];
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
            <Canvas
                {...props}
                metrics={MOBILE}
                label="Fluxo acadêmico, um semestre por vez"
                page={page}
            />
        </div>
    );
}
