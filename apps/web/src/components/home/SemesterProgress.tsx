import React from 'react';

interface SemesterProgressProps {
    daysRemaining?: number;
    percentage?: number;
    startDate?: string;
    endDate?: string;
}

export const SemesterProgress: React.FC<SemesterProgressProps> = ({
    daysRemaining = 42,
    percentage = 68,
    startDate = 'Início (Ago)',
    endDate = 'Fim (Dez)'
}) => {
    return (
        <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-[#E4E7E7] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-[#5A686E]">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-[#1EA6A9]">
                        calendar_month
                    </span>
                    <span className="text-[12.5px] font-bold text-[#243037]">
                        Faltam {daysRemaining} dias para o fim do período letivo
                    </span>
                </div>
                <span className="text-[11.5px] font-bold text-[#007080]">{percentage}%</span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-[#E4E7E7]">
                <div
                    className="h-2 rounded-full bg-[#1EA6A9] transition-all duration-700"
                    style={{ width: `${percentage}%` }}
                />
            </div>

            <div className="flex items-center justify-between text-[11px] font-semibold text-[#5A686E]">
                <span>• {startDate}</span>
                <span>{endDate} •</span>
            </div>
        </div>
    );
};
