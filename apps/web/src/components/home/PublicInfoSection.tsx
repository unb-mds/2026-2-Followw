import { Link } from '@tanstack/react-router';
import { Utensils } from 'lucide-react';

import type { Campus, DailyMenu, MenuSection } from '#/queries/restaurant';

import { SectionHeader } from '#/components/SectionHeader';
import { Card, CardContent, CardHeader } from '#/components/ui/card';
import { CAMPUS_LABELS } from '#/queries/restaurant';

interface PublicInfoSectionProps {
    campus: Campus;
    menu?: DailyMenu;
    isLoading?: boolean;
}

function mainDish(sections: MenuSection[] | null | undefined) {
    const section = sections?.find((s) => s.key === 'main_dish') ?? sections?.[0];
    return section?.items.join(', ');
}

export const PublicInfoSection: React.FC<PublicInfoSectionProps> = ({
    campus,
    menu,
    isLoading
}) => {
    const meals = [
        { label: 'Almoço', dish: mainDish(menu?.lunch) },
        { label: 'Jantar', dish: mainDish(menu?.dinner) }
    ].filter((meal) => meal.dish);

    return (
        <div className="mt-6 flex flex-col gap-4">
            <div>
                <SectionHeader title="RU" actionLabel="Ver Cardápio" actionTo="/ru" />
                <Link
                    to="/ru"
                    className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
                >
                    <Card className="transition-colors hover:ring-primary">
                        <CardHeader className="flex flex-row items-center gap-3">
                            <div className="flex size-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                                <Utensils className="size-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-foreground">
                                    Prato Principal Hoje
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    Campus {CAMPUS_LABELS[campus]}
                                </p>
                            </div>
                        </CardHeader>

                        <CardContent>
                            <div className="space-y-1.5 border-t border-border pt-2">
                                {meals.map((meal) => (
                                    <div
                                        key={meal.label}
                                        className="flex items-start gap-2 text-xs"
                                    >
                                        <span className="shrink-0 font-bold text-primary">
                                            {meal.label}:
                                        </span>
                                        <span className="line-clamp-1 text-foreground">
                                            {meal.dish}
                                        </span>
                                    </div>
                                ))}
                                {meals.length === 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        {isLoading
                                            ? 'Carregando cardápio...'
                                            : 'Cardápio de hoje não publicado.'}
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    );
};
