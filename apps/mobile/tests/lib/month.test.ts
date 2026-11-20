import { dayLabel, monthOf, monthWeeks, shiftMonth } from '@/lib/month';

test('troca de mês atravessando o ano', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthOf('2026-10-05')).toBe('2026-10');
});

test('semanas do mês começam no domingo com dias vazios fora dele', () => {
    const weeks = monthWeeks('2026-10');
    // 1º de outubro de 2026 é uma quinta-feira
    expect(weeks[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(weeks.at(-1)).toEqual([
        '2026-10-25',
        '2026-10-26',
        '2026-10-27',
        '2026-10-28',
        '2026-10-29',
        '2026-10-30',
        '2026-10-31'
    ]);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
});

test('rótulo do dia por extenso', () => {
    expect(dayLabel('2026-10-05')).toBe('5 de outubro');
});
