import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronUp, Coffee, Soup, UtensilsCrossed } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { MenuMeal } from '#/lib/restaurant';

import { Button } from '#/components/ui/button';
import { cn } from '#/lib/shadcn';

const MEAL_ICONS = { breakfast: Coffee, lunch: UtensilsCrossed, dinner: Soup };
const WHEEL_THRESHOLD = 40;
const WHEEL_IDLE_MS = 180;

function slideState(position: number) {
    if (position === 0) return 'active';
    if (position === 1) return 'next';
    return position < 0 ? 'past' : 'future';
}

export function MealCarousel({ meals }: { meals: readonly MenuMeal[] }) {
    const [active, setActive] = useState(0);
    const viewport = useRef<HTMLElement>(null);
    const gesture = useRef({ delta: 0, last: -Infinity, consumed: false, direction: 0 });
    const touch = useRef<{ x: number; y: number; consumed: boolean } | null>(null);

    useEffect(() => {
        const target = viewport.current;
        if (!target) return undefined;
        const wheel = (event: WheelEvent) => {
            if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
            const direction = Math.sign(event.deltaY);
            const state = gesture.current;
            if (event.timeStamp - state.last > WHEEL_IDLE_MS || state.direction !== direction) {
                state.delta = 0;
                state.consumed = false;
            }
            state.last = event.timeStamp;
            state.direction = direction;
            if (state.consumed) {
                event.preventDefault();
                return;
            }
            const next = active + direction;
            if (next < 0) return;
            event.preventDefault();
            if (next > meals.length) return;
            const unit =
                event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? target.clientHeight : 1;
            state.delta += event.deltaY * unit;
            if (Math.abs(state.delta) < WHEEL_THRESHOLD) return;
            state.consumed = true;
            setActive(next);
        };
        const touchStart = (event: TouchEvent) => {
            const point = event.touches[0];
            touch.current =
                event.touches.length === 1
                    ? { x: point.clientX, y: point.clientY, consumed: false }
                    : null;
        };
        const touchMove = (event: TouchEvent) => {
            const start = touch.current;
            if (event.touches.length !== 1) {
                touch.current = null;
                return;
            }
            if (!start) return;
            const point = event.touches[0];
            const deltaY = start.y - point.clientY;
            if (Math.abs(deltaY) < 8 || Math.abs(deltaY) <= Math.abs(start.x - point.clientX))
                return;
            const next = active + Math.sign(deltaY);
            if (next < 0 && !start.consumed) return;
            event.preventDefault();
            if (start.consumed || Math.abs(deltaY) < WHEEL_THRESHOLD || next > meals.length) return;
            start.consumed = true;
            setActive(next);
        };
        const touchEnd = () => {
            touch.current = null;
        };
        target.addEventListener('wheel', wheel, { passive: false });
        target.addEventListener('touchstart', touchStart, { passive: true });
        target.addEventListener('touchmove', touchMove, { passive: false });
        target.addEventListener('touchend', touchEnd);
        target.addEventListener('touchcancel', touchEnd);
        return () => {
            target.removeEventListener('wheel', wheel);
            target.removeEventListener('touchstart', touchStart);
            target.removeEventListener('touchmove', touchMove);
            target.removeEventListener('touchend', touchEnd);
            target.removeEventListener('touchcancel', touchEnd);
        };
    }, [active, meals.length]);

    const current = meals[active];
    return (
        <section
            ref={viewport}
            aria-roledescription="carrossel"
            aria-label="Próximas refeições do RU"
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- O carrossel permite trocar a refeição pelas setas do teclado.
            tabIndex={0}
            className="relative rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card"
            onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                const next =
                    event.key === 'ArrowDown'
                        ? active + 1
                        : event.key === 'ArrowUp'
                          ? active - 1
                          : event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? meals.length
                              : null;
                if (next === null) return;
                event.preventDefault();
                setActive(Math.max(0, Math.min(meals.length, next)));
            }}
        >
            <div className="meal-carousel-window">
                <div className="meal-carousel-stage">
                    {meals.map((meal, index) => {
                        const Icon = MEAL_ICONS[meal.key];
                        const position = index - active;
                        const visible = position === 0 || position === 1;
                        return (
                            <article
                                key={`${meal.date}-${meal.key}`}
                                aria-label={meal.label}
                                aria-roledescription="slide"
                                aria-hidden={!visible || undefined}
                                data-state={slideState(position)}
                                className="meal-carousel-card relative flex min-w-0 flex-col gap-3 rounded-xl border p-4"
                            >
                                {position === 0 ? (
                                    <Link
                                        to="/ru"
                                        search={{ date: meal.date, meal: meal.key }}
                                        aria-label={`Ver cardápio de ${meal.label.toLowerCase()}`}
                                        className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                                    />
                                ) : (
                                    <button
                                        type="button"
                                        tabIndex={visible ? 0 : -1}
                                        aria-label={`Mostrar ${meal.label.toLowerCase()}`}
                                        className="absolute inset-0 cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                                        onClick={() => setActive(index)}
                                    />
                                )}
                                <div
                                    className={cn(
                                        'pointer-events-none flex items-center gap-3 text-xs',
                                        position === 0
                                            ? 'font-medium text-primary'
                                            : 'text-muted-foreground'
                                    )}
                                >
                                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                                    <h3>{meal.label}</h3>
                                </div>
                                <p className="pointer-events-none text-2xl font-medium wrap-break-word">
                                    {meal.dish}
                                </p>
                            </article>
                        );
                    })}
                    <article
                        aria-label="Cardápio completo"
                        aria-roledescription="slide"
                        aria-hidden={active < meals.length - 1 || undefined}
                        data-state={slideState(meals.length - active)}
                        className="meal-carousel-card meal-carousel-menu relative flex items-center justify-center rounded-xl p-4"
                    >
                        <Link
                            to="/ru"
                            search={{ date: meals[0].date }}
                            tabIndex={active >= meals.length - 1 ? 0 : -1}
                            aria-label="Ver cardápio completo"
                            className="inline-flex items-center justify-center rounded-full border border-primary/20 bg-primary/5 px-5 py-2.5 text-lg font-medium text-primary shadow-sm transition-colors outline-none hover:border-primary/30 hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            Ver Cardápio
                        </Link>
                    </article>
                    <div className="meal-carousel-space" aria-hidden="true" />
                </div>
            </div>
            <div className="mt-1 flex justify-end gap-0.5 text-muted-foreground">
                <Button
                    size="icon-sm"
                    className="size-11 desktop:size-7"
                    variant="ghost"
                    aria-label="Refeição anterior"
                    disabled={active === 0}
                    onClick={() => setActive(active - 1)}
                >
                    <ChevronUp aria-hidden="true" />
                </Button>
                <Button
                    size="icon-sm"
                    className="size-11 desktop:size-7"
                    variant="ghost"
                    aria-label="Próxima refeição"
                    disabled={active === meals.length}
                    onClick={() => setActive(active + 1)}
                >
                    <ChevronDown aria-hidden="true" />
                </Button>
            </div>
            <output className="sr-only">
                {current
                    ? `Refeição ${active + 1} de ${meals.length}: ${current.label}, ${current.dish}`
                    : 'Ver cardápio completo'}
            </output>
        </section>
    );
}
