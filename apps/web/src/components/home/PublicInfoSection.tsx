import type { Day } from '#/lib/schedule';
import type { Campus, DailyMenu } from '#/queries/restaurant';

import { MealCarousel } from '#/components/home/MealCarousel';
import { LoadingText } from '#/components/LoadingText';
import { SectionHeader } from '#/components/SectionHeader';
import { Card } from '#/components/ui/card';
import { upcomingMenuMeals } from '#/lib/restaurant';
import { nowInBrasilia } from '#/lib/schedule';
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

export const PublicInfoSection: React.FC<PublicInfoSectionProps> = ({
    campus,
    menus,
    isLoading,
    day,
    date,
    now = nowInBrasilia()
}) => {
    const selectedDate = date ?? now.date;
    const upcoming = upcomingMenuMeals(menus ?? [], selectedDate, now);

    return (
        <section aria-label="RU">
            <SectionHeader title="RU" />
            <Card size="sm" className="relative gap-5 p-4 desktop:p-6">
                <div className="pointer-events-none relative flex items-baseline gap-2 text-xs">
                    <span className="font-semibold text-primary">Próximas refeições</span>
                    <span className="ml-auto truncate font-medium text-muted-foreground">
                        Campus {CAMPUS_LABELS[campus]}
                    </span>
                </div>
                {upcoming.length > 0 ? (
                    <MealCarousel
                        key={`${campus}:${upcoming.map((meal) => `${meal.date}-${meal.key}`).join('|')}`}
                        meals={upcoming}
                    />
                ) : (
                    <p className="pointer-events-none relative text-xs text-muted-foreground">
                        {isLoading ? (
                            <LoadingText>Carregando cardápio...</LoadingText>
                        ) : selectedDate === now.date ? (
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
