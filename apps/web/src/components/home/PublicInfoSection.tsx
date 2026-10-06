import { Link } from '@tanstack/react-router';
import { Soup, UtensilsCrossed } from 'lucide-react';

import type { Campus, DailyMenu, MenuSection } from '#/queries/restaurant';

import { LoadingText } from '#/components/LoadingText';
import { SectionHeader } from '#/components/SectionHeader';
import { Card } from '#/components/ui/card';
import { CAMPUS_LABELS } from '#/queries/restaurant';

interface PublicInfoSectionProps {
    campus: Campus;
    menu?: DailyMenu;
    isLoading?: boolean;
    day?: string;
}

function mainDish(sections: MenuSection[] | null | undefined) {
    const section = sections?.find((s) => s.key === 'main_dish') ?? sections?.[0];
    return section?.items.join(', ');
}

export const PublicInfoSection: React.FC<PublicInfoSectionProps> = ({
    campus,
    menu,
    isLoading,
    day
}) => {
    const meals = [
        { label: 'Almoço', icon: UtensilsCrossed, dish: mainDish(menu?.lunch) },
        { label: 'Jantar', icon: Soup, dish: mainDish(menu?.dinner) }
    ].filter((meal) => meal.dish);

    return (
        <section className="mt-6" aria-label="RU">
            <SectionHeader title="RU" actionLabel="Ver Cardápio" actionTo="/ru" />
            <Card size="sm" className="relative gap-2 px-3">
                <Link
                    to="/ru"
                    aria-label="Ver cardápio do RU"
                    className="absolute inset-0 rounded-2xl transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring"
                />
                <div className="pointer-events-none relative flex items-baseline gap-2 text-xs">
                    <span className="font-semibold text-primary">
                        Prato principal {day ? `· ${day}` : 'hoje'}
                    </span>
                    <span className="ml-auto truncate font-medium text-muted-foreground">
                        Campus {CAMPUS_LABELS[campus]}
                    </span>
                </div>
                {meals.length > 0 ? (
                    <dl className="pointer-events-none relative space-y-1.5">
                        {meals.map((meal) => (
                            <div key={meal.label} className="flex items-center gap-2">
                                <meal.icon
                                    className="size-3.5 shrink-0 text-muted-foreground"
                                    aria-hidden="true"
                                />
                                <dt className="w-12 shrink-0 text-xs text-muted-foreground">
                                    {meal.label}
                                </dt>
                                <dd className="min-w-0 truncate text-sm font-semibold">
                                    {meal.dish}
                                </dd>
                            </div>
                        ))}
                    </dl>
                ) : (
                    <p className="pointer-events-none relative text-xs text-muted-foreground">
                        {isLoading ? (
                            <LoadingText>Carregando cardápio...</LoadingText>
                        ) : (
                            `Cardápio de ${day?.toLowerCase() ?? 'hoje'} não publicado.`
                        )}
                    </p>
                )}
            </Card>
        </section>
    );
};
