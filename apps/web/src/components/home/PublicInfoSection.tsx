import { Link } from '@tanstack/react-router';
import { Coffee, Soup, UtensilsCrossed } from 'lucide-react';

import type { Day } from '#/lib/schedule';
import type { Campus, DailyMenu } from '#/queries/restaurant';

import { LoadingText } from '#/components/LoadingText';
import { SectionHeader } from '#/components/SectionHeader';
import { Card } from '#/components/ui/card';
import { formatMenuDay, previewMenuMeals } from '#/lib/restaurant';
import { nowInBrasilia } from '#/lib/schedule';
import { CAMPUS_LABELS } from '#/queries/restaurant';

const MEAL_ICONS = { breakfast: Coffee, lunch: UtensilsCrossed, dinner: Soup };

interface PublicInfoSectionProps {
    campus: Campus;
    menus?: DailyMenu[];
    isLoading?: boolean;
    // rótulo do dia exibido: "Hoje", "Quarta-feira"...
    day: string;
    date?: string;
    now?: Day & { time: string };
}

export const PublicInfoSection: React.FC<PublicInfoSectionProps> = ({
    campus,
    menus,
    isLoading,
    day,
    date,
    now = nowInBrasilia()
}) => {
    const selectedDate = date ?? now.date;
    const isToday = selectedDate === now.date;
    const meals = previewMenuMeals(menus ?? [], selectedDate, now);
    const published = meals.filter((meal) => meal.dish);
    const next = meals[0];

    return (
        <section aria-label="RU">
            <SectionHeader title="RU" actionLabel="Ver Cardápio" actionTo="/ru" />
            <Card size="sm" className="relative gap-3 p-4 desktop:p-6">
                <Link
                    to="/ru"
                    search={isToday ? { date: next.date, meal: next.key } : { date: selectedDate }}
                    aria-label="Ver cardápio do RU"
                    className="absolute inset-0 rounded-2xl transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring"
                />
                <div className="pointer-events-none relative flex items-baseline gap-2 text-xs">
                    <span className="font-semibold text-primary">
                        {isToday ? 'Próxima refeição' : `Pratos principais · ${day}`}
                    </span>
                    <span className="ml-auto truncate font-medium text-muted-foreground">
                        Campus {CAMPUS_LABELS[campus]}
                    </span>
                </div>
                {isLoading && published.length === 0 ? (
                    <p className="pointer-events-none relative text-xs text-muted-foreground">
                        <LoadingText>Carregando cardápio...</LoadingText>
                    </p>
                ) : isToday ? (
                    <NextMeal meal={next} today={now.date} />
                ) : published.length > 0 ? (
                    <dl className="pointer-events-none relative flex flex-col gap-1.5">
                        {published.map((meal) => {
                            const Icon = MEAL_ICONS[meal.key];
                            return (
                                <div key={meal.key} className="flex items-center gap-2">
                                    <Icon
                                        className="size-3.5 shrink-0 text-muted-foreground"
                                        aria-hidden="true"
                                    />
                                    <dt className="w-24 shrink-0 text-xs text-muted-foreground">
                                        {meal.label}
                                    </dt>
                                    <dd className="min-w-0 truncate text-sm font-semibold">
                                        {meal.dish}
                                    </dd>
                                </div>
                            );
                        })}
                    </dl>
                ) : (
                    <p className="pointer-events-none relative text-xs text-muted-foreground">
                        Cardápio de {day.toLowerCase()} não publicado.
                    </p>
                )}
            </Card>
        </section>
    );
};

function NextMeal({
    meal,
    today
}: {
    meal: ReturnType<typeof previewMenuMeals>[number];
    today: string;
}) {
    const Icon = MEAL_ICONS[meal.key];
    return (
        <div className="pointer-events-none relative flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <h3>
                    {meal.label} · {formatMenuDay(meal.date, today)} · {meal.start}–{meal.end}
                </h3>
            </div>
            {meal.dish ? (
                <p className="text-2xl font-medium wrap-break-word">{meal.dish}</p>
            ) : (
                <p className="text-xs text-muted-foreground">
                    Cardápio do {meal.label.toLowerCase()} não publicado.
                </p>
            )}
        </div>
    );
}
