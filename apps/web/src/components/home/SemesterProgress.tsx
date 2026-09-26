interface SemesterProgressProps {
    daysRemaining: number;
    percentage: number;
    startDate: string;
    endDate: string;
}

export const SemesterProgress: React.FC<SemesterProgressProps> = ({
    daysRemaining,
    percentage,
    startDate,
    endDate
}) => {
    return (
        <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-line bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-muted">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg text-primary">
                        calendar_month
                    </span>
                    <span className="text-xs font-bold text-ink">
                        Faltam {daysRemaining} dias para o fim do período letivo
                    </span>
                </div>
                <span className="text-xs font-bold text-primary-dark">{percentage}%</span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-line">
                <div
                    className="h-2 rounded-full bg-primary transition-all duration-700"
                    style={{ width: `${percentage}%` }}
                />
            </div>

            <div className="flex items-center justify-between text-xs font-semibold text-muted">
                <span>• {startDate}</span>
                <span>{endDate} •</span>
            </div>
        </div>
    );
};
