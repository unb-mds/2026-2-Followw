import { Link } from '@tanstack/react-router';
import React from 'react';

import { Card } from '../ui/Card';
import { SectionHeader } from '../ui/SectionHeader';

export interface NewsItem {
    id: string;
    title: string;
    date: string;
    category?: string;
    url?: string;
}

interface PublicInfoSectionProps {
    ruMenuSummary?: {
        lunch?: string;
        dinner?: string;
    };
}

const DEFAULT_RU_SUMMARY = {
    lunch: 'Estrogonofe de Frango, Arroz, Feijão, Salada Tropical',
    dinner: 'Sopa de Legumes, Pão de Alho, Fruta da Estação'
};

export const PublicInfoSection: React.FC<PublicInfoSectionProps> = ({
    ruMenuSummary = DEFAULT_RU_SUMMARY
}) => {
    return (
        <div className="mt-6 flex flex-col gap-4">
            {/* RU Quick Card */}
            <div>
                <SectionHeader
                    title="Restaurante Universitário"
                    actionLabel="Ver Cardápio"
                    onAction={() => {}}
                />
                <Link to="/ru">
                    <Card className="cursor-pointer transition-all hover:border-[#1EA6A9]">
                        <div className="mb-2 flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#1EA6A9]/20 bg-[#E6FAF5] text-[#1EA6A9]">
                                <span className="material-symbols-outlined text-[20px]">
                                    restaurant
                                </span>
                            </div>
                            <div>
                                <h3 className="text-[14px] font-bold text-[#243037]">
                                    Prato Principal Hoje
                                </h3>
                                <p className="text-[11px] text-[#5A686E]">Campus Darcy Ribeiro</p>
                            </div>
                        </div>

                        <div className="space-y-1.5 border-t border-[#E4E7E7]/60 pt-2">
                            {ruMenuSummary?.lunch && (
                                <div className="flex items-start gap-2 text-[12.5px]">
                                    <span className="shrink-0 font-bold text-[#1EA6A9]">
                                        Almoço:
                                    </span>
                                    <span className="line-clamp-1 text-[#243037]">
                                        {ruMenuSummary.lunch}
                                    </span>
                                </div>
                            )}
                            {ruMenuSummary?.dinner && (
                                <div className="flex items-start gap-2 text-[12.5px]">
                                    <span className="shrink-0 font-bold text-[#007080]">
                                        Jantar:
                                    </span>
                                    <span className="line-clamp-1 text-[#243037]">
                                        {ruMenuSummary.dinner}
                                    </span>
                                </div>
                            )}
                        </div>
                    </Card>
                </Link>
            </div>
        </div>
    );
};
