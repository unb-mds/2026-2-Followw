import { createFileRoute } from '@tanstack/react-router';
import React from 'react';

import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/ui/Card';
import { HeaderBar } from '../components/ui/HeaderBar';

export const Route = createFileRoute('/ru')({
    component: RUPage
});

function RUPage() {
    return (
        <AppLayout>
            <HeaderBar />
            <div className="space-y-4">
                <Card className="p-6 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[#1EA6A9]/20 bg-[#E6FAF5] text-[#1EA6A9]">
                        <span className="material-symbols-outlined text-[28px]">restaurant</span>
                    </div>
                    <h3 className="text-[17px] font-bold text-[#243037]">Cardápio do RU</h3>
                    <p className="mt-1 text-[13px] text-[#5A686E]">
                        Consulte os pratos do dia para os campi Darcy Ribeiro, FGA, FCE e FPD.
                    </p>
                </Card>
            </div>
        </AppLayout>
    );
}
