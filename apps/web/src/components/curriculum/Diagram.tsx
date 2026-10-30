import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { AcademicState, CurriculumModel, FlowSubject } from '#/lib/curriculum/model';

import { Connections } from '#/components/curriculum/Connections';
import { SubjectCard } from '#/components/curriculum/SubjectCard';
import { Button } from '#/components/ui/button';
import { layoutCurriculum } from '#/lib/curriculum/geometry';
import { relatedEdgeIds } from '#/lib/curriculum/relations';

export interface DiagramProps {
    model: CurriculumModel;
    selected?: string;
    state: (subject: FlowSubject) => AcademicState | null;
}
function useWidth() {
    const ref = useRef<HTMLElement>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const element = ref.current;
        if (!element) return undefined;
        const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return { ref, width };
}

function Canvas({
    model,
    selected,
    state,
    mobilePeriod
}: DiagramProps & { mobilePeriod?: number }) {
    const { ref, width } = useWidth();
    const [active, setActive] = useState<string | null>(null);
    const visibleEdges = useMemo(
        () =>
            mobilePeriod !== undefined ? null : active ? relatedEdgeIds(model.edges, active) : null,
        [model, active, mobilePeriod]
    );
    const geometry = useMemo(
        () => layoutCurriculum(model, width, mobilePeriod),
        [model, width, mobilePeriod]
    );
    const revealed = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (!width || mobilePeriod !== undefined || !selected || revealed.current === selected)
            return;
        const node = geometry.nodes.find((item) => item.subject.code === selected);
        if (!node || !ref.current) return;
        ref.current.scrollTo({
            left: Math.max(0, node.x - (width - node.width) / 2),
            top: Math.max(0, node.y - (ref.current.clientHeight - node.height) / 2)
        });
        revealed.current = selected;
    }, [geometry, mobilePeriod, ref, selected, width]);
    return (
        <section
            ref={ref}
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Região rolável deve receber navegação por teclado.
            tabIndex={0}
            aria-label={
                mobilePeriod === undefined
                    ? 'Fluxo acadêmico por semestres, área de rolagem'
                    : `Disciplinas do ${mobilePeriod}º semestre`
            }
            className="min-h-0 flex-1 overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-primary"
        >
            {width > 0 && (
                <div
                    className="relative"
                    style={{ width: geometry.width, height: geometry.height }}
                >
                    <Connections geometry={geometry} visibleEdges={visibleEdges} />
                    {mobilePeriod === undefined &&
                        geometry.headings.map(({ period, x }) => (
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
                            model={model}
                            state={state(node.subject)}
                            selected={
                                selected === node.subject.code || active === node.subject.code
                            }
                            onHover={mobilePeriod === undefined ? setActive : undefined}
                            mobile={mobilePeriod !== undefined}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
export function DesktopDiagram(props: DiagramProps) {
    return <Canvas {...props} />;
}

export function MobileDiagram({
    initialPeriod,
    ...props
}: DiagramProps & { initialPeriod: number }) {
    const [period, setPeriod] = useState(initialPeriod);
    const index = Math.max(0, props.model.periods.indexOf(period));
    const actualPeriod = props.model.periods[index];
    const scrollRef = useRef<HTMLDivElement>(null);
    function changePeriod(next: number) {
        setPeriod(props.model.periods[next]);
        scrollRef.current?.querySelector('section')?.scrollTo({ top: 0 });
    }
    return (
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col">
            <div className="mx-4 mb-2 flex shrink-0 items-center justify-between gap-4 rounded-2xl bg-muted/60 p-2">
                <Button
                    variant="outline"
                    size="icon"
                    className="size-11"
                    aria-label="Semestre anterior"
                    disabled={index === 0}
                    onClick={() => changePeriod(index - 1)}
                >
                    <ChevronLeft />
                </Button>
                <h2 className="text-xl font-bold" aria-live="polite">
                    {actualPeriod}º semestre
                </h2>
                <Button
                    variant="outline"
                    size="icon"
                    className="size-11"
                    aria-label="Próximo semestre"
                    disabled={index === props.model.periods.length - 1}
                    onClick={() => changePeriod(index + 1)}
                >
                    <ChevronRight />
                </Button>
            </div>
            <Canvas {...props} mobilePeriod={actualPeriod} />
        </div>
    );
}
