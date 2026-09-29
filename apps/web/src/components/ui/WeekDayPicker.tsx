import type { Day } from '#/lib/schedule';

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

interface WeekDayPickerProps {
    days: Day[];
    selectedDate: string;
    onSelect: (day: Day) => void;
}

export function WeekDayPicker({ days, selectedDate, onSelect }: WeekDayPickerProps) {
    return (
        <div className="mb-4 flex items-center gap-2 overflow-x-auto py-1" aria-label="Escolher dia">
            {days.map((day) => {
                const isActive = day.date === selectedDate;
                return (
                    <button
                        key={day.date}
                        type="button"
                        onClick={() => onSelect(day)}
                        aria-label={day.date}
                        aria-pressed={isActive}
                        className={`flex h-16 flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border transition-all ${
                            isActive
                                ? 'border-transparent bg-primary text-white shadow-md shadow-primary/30'
                                : 'border-line bg-white/80 text-muted hover:bg-white'
                        }`}
                    >
                        <span
                            className={`text-xs font-bold tracking-wider uppercase ${
                                isActive ? 'text-white/90' : 'text-subtle'
                            }`}
                        >
                            {MONTHS[Number(day.date.slice(5, 7)) - 1]}
                        </span>
                        <span
                            className={`text-lg font-extrabold ${isActive ? 'text-white' : 'text-ink'}`}
                        >
                            {Number(day.date.slice(8))}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
