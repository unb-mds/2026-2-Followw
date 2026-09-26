import { Link, useNavigate } from '@tanstack/react-router';

import type { Campus, DailyMenu, MenuSection } from '#/queries/restaurant';

import { Card } from '#/components/ui/Card';
import { SectionHeader } from '#/components/ui/SectionHeader';
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
    const navigate = useNavigate();
    const meals = [
        { label: 'Almoço', color: 'var(--color-primary)', dish: mainDish(menu?.lunch) },
        { label: 'Jantar', color: 'var(--color-primary-dark)', dish: mainDish(menu?.dinner) }
    ].filter((meal) => meal.dish);

    return (
        <div className="mt-6 flex flex-col gap-4">
            <div>
                <SectionHeader
                    title="RU"
                    actionLabel="Ver Cardápio"
                    onAction={() => navigate({ to: '/ru' })}
                />
                <Link to="/ru">
                    <Card className="cursor-pointer transition-all hover:border-primary">
                        <div className="mb-2 flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary-light text-primary">
                                <span className="material-symbols-outlined text-xl">
                                    restaurant
                                </span>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-ink">Prato Principal Hoje</h3>
                                <p className="text-xs text-muted">Campus {CAMPUS_LABELS[campus]}</p>
                            </div>
                        </div>

                        <div className="space-y-1.5 border-t border-line/60 pt-2">
                            {meals.map((meal) => (
                                <div key={meal.label} className="flex items-start gap-2 text-xs">
                                    <span
                                        className="shrink-0 font-bold"
                                        style={{ color: meal.color }}
                                    >
                                        {meal.label}:
                                    </span>
                                    <span className="line-clamp-1 text-ink">{meal.dish}</span>
                                </div>
                            ))}
                            {meals.length === 0 && (
                                <p className="text-xs text-muted">
                                    {isLoading
                                        ? 'Carregando cardápio...'
                                        : 'Cardápio de hoje não publicado.'}
                                </p>
                            )}
                        </div>
                    </Card>
                </Link>
            </div>
        </div>
    );
};
