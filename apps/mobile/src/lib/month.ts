export const MONTHS = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro'
];

// mês como `YYYY-MM`, comparável como texto
export const monthOf = (iso: string) => iso.slice(0, 7);

export function shiftMonth(month: string, delta: number) {
    const [year, index] = month.split('-').map(Number);
    const total = year * 12 + index - 1 + delta;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Semanas do mês (domingo a sábado), com `null` fora dele. */
export function monthWeeks(month: string) {
    const [year, index] = month.split('-').map(Number);
    const first = new Date(Date.UTC(year, index - 1, 1)).getUTCDay();
    const length = new Date(Date.UTC(year, index, 0)).getUTCDate();
    const cells = [
        ...Array.from({ length: first }, () => null),
        ...Array.from({ length }, (_, day) => `${month}-${String(day + 1).padStart(2, '0')}`)
    ];
    const weeks: (string | null)[][] = [];
    for (let start = 0; start < cells.length; start += 7) {
        const week = cells.slice(start, start + 7);
        weeks.push([...week, ...Array.from({ length: 7 - week.length }, () => null)]);
    }
    return weeks;
}

export function dayLabel(iso: string) {
    const [, month, day] = iso.split('-').map(Number);
    return `${day} de ${MONTHS[month - 1]}`;
}
