import { Link } from '@tanstack/react-router';
import { Coffee, Soup, UtensilsCrossed } from 'lucide-react';

import type { Day } from '#/lib/schedule';
import type { Campus, DailyMenu } from '#/queries/restaurant';

import { useDesktop } from '#/components/DesktopContext';
import { LoadingText } from '#/components/LoadingText';
import { SectionHeader } from '#/components/SectionHeader';
import { Card } from '#/components/ui/card';
import { mainMenuDish, MEAL_TIMES, upcomingMenuMeals } from '#/lib/restaurant';
import { nowInBrasilia } from '#/lib/schedule';
import { cn } from '#/lib/shadcn';
import { CAMPUS_LABELS } from '#/queries/restaurant';

interface PublicInfoSectionProps {
    campus: Campus;
    menus?: DailyMenu[];
    isLoading?: boolean;
    // rótulo do dia exibido: "Hoje", "Quarta-feira"...
    day: string;
    date?: string;
    now?: Day & { time: string };
}

const MEAL_ICONS = { breakfast: Coffee, lunch: UtensilsCrossed, dinner: Soup };

export const PublicInfoSection: React.FC<PublicInfoSectionProps> = ({
    campus,
    menus,
    isLoading,
    day,
    date,
    now = nowInBrasilia()
}) => {
    const desktop = useDesktop();
    const selectedDate = date ?? now.date;
    const menu = date ? menus?.find((entry) => entry.date === date) : menus?.[0];
    const meals = [
        {
            ...MEAL_TIMES[0],
            label: 'Café',
            date: selectedDate,
            dish: mainMenuDish(menu?.breakfast)
        },
        { ...MEAL_TIMES[1], date: selectedDate, dish: mainMenuDish(menu?.lunch) },
        { ...MEAL_TIMES[2], date: selectedDate, dish: mainMenuDish(menu?.dinner) }
    ].filter((meal) => meal.dish);
    const visible = desktop ? upcomingMenuMeals(menus ?? [], selectedDate, now) : meals;

    return (
        <section aria-label="RU">
            <SectionHeader title="RU" actionLabel="Ver Cardápio" actionTo="/ru" />
            <Card size="sm" className="relative gap-2 px-3 desktop:gap-5 desktop:p-6">
                <Link
                    to="/ru"
                    aria-label="Ver cardápio do RU"
                    className="absolute inset-0 rounded-2xl transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring"
                />
                <div className="pointer-events-none relative flex items-baseline gap-2 text-xs">
                    <span className="font-semibold text-primary">
                        {desktop ? 'Próximas refeições' : `Pratos principais · ${day}`}
                    </span>
                    <span className="ml-auto truncate font-medium text-muted-foreground">
                        Campus {CAMPUS_LABELS[campus]}
                    </span>
                </div>
                {visible.length > 0 ? (
                    <dl className="pointer-events-none relative flex flex-col gap-1.5">
                        {visible.map((meal, index) => {
                            const Icon = MEAL_ICONS[meal.key];
                            return (
                                <div
                                    key={`${meal.date}-${meal.key}`}
                                    className={cn(
                                        'flex items-center gap-2 desktop:flex-wrap desktop:gap-3 desktop:p-4',
                                        index === 0 &&
                                            'desktop:rounded-xl desktop:border desktop:border-primary/30 desktop:bg-primary/5',
                                        index > 0 && 'desktop:mt-2'
                                    )}
                                >
                                    <Icon
                                        className={cn(
                                            'size-3.5 shrink-0 text-muted-foreground',
                                            index === 0 && 'desktop:text-primary'
                                        )}
                                        aria-hidden="true"
                                    />
                                    <dt
                                        className={cn(
                                            'w-12 shrink-0 text-xs text-muted-foreground desktop:w-auto desktop:min-w-0 desktop:flex-1 desktop:shrink',
                                            index === 0 &&
                                                'desktop:font-medium desktop:text-primary'
                                        )}
                                    >
                                        {meal.label}
                                    </dt>
                                    <dd
                                        className={cn(
                                            'min-w-0 truncate text-sm font-semibold desktop:w-full desktop:font-medium desktop:whitespace-normal',
                                            index === 0 ? 'desktop:text-2xl' : 'desktop:text-lg'
                                        )}
                                    >
                                        {meal.dish}
                                    </dd>
                                </div>
                            );
                        })}
                    </dl>
                ) : (
                    <p className="pointer-events-none relative text-xs text-muted-foreground">
                        {isLoading ? (
                            <LoadingText>Carregando cardápio...</LoadingText>
                        ) : desktop ? (
                            'Cardápio das próximas refeições não publicado.'
                        ) : (
                            `Cardápio de ${day.toLowerCase()} não publicado.`
                        )}
                    </p>
                )}
            </Card>
        </section>
    );
};
