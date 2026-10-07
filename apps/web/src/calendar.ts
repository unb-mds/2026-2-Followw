import calendarData from 'academic-calendar';

export type CalendarEventCategory =
    | 'academic'
    | 'administrative'
    | 'enrollment'
    | 'holiday'
    | 'optional_holiday'
    | 'university_week'
    | 'other';

export interface CalendarEvent {
    id?: string;
    name: string;
    start_date: string;
    end_date: string;
    category: string;
}

export interface CalendarPeriod {
    start: string;
    end: string;
}

export interface ClassesPeriod extends CalendarPeriod {
    instructional_days: number;
}

export interface SemesterCalendar {
    semester: string;
    name: string;
    period: CalendarPeriod;
    classes: ClassesPeriod;
    events: CalendarEvent[];
}

export interface AcademicCalendar {
    semesters: Record<string, SemesterCalendar>;
}

export const academicCalendar: AcademicCalendar = calendarData;

const NO_CLASS_EVENT_CATEGORIES: ReadonlySet<string> = new Set<CalendarEventCategory>([
    'holiday',
    'optional_holiday',
    'university_week'
]);

export function getNoClassEvents(date: string): CalendarEvent[] {
    return listSemesters().flatMap(({ period, events }) =>
        period.start <= date && date <= period.end
            ? events.filter(
                  (event) =>
                      NO_CLASS_EVENT_CATEGORIES.has(event.category) &&
                      event.start_date <= date &&
                      date <= event.end_date
              )
            : []
    );
}

export function getNoClassReason(date: string): string | undefined {
    const event = getNoClassEvents(date)[0];
    if (event) return event.name;

    const semester = listSemesters().find(
        ({ period }) => period.start <= date && date <= period.end
    );
    if (semester && (date < semester.classes.start || date > semester.classes.end)) {
        return 'Fora do período de aulas';
    }
    return undefined;
}

export function getSemester(semester: string): SemesterCalendar | undefined {
    return academicCalendar.semesters[semester];
}

export function listSemesters(): SemesterCalendar[] {
    return Object.values(academicCalendar.semesters);
}

export function getCurrentSemester(date: Date = new Date()): SemesterCalendar | undefined {
    const today = date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const semesters = listSemesters();

    // Retorna o semestre atual ou o futuro mais próximo
    return (
        semesters.find(({ period }) => period.start <= today && today <= period.end) ??
        semesters
            .filter(({ period }) => period.start > today)
            .reduce<SemesterCalendar | undefined>(
                (next, s) => (!next || s.period.start < next.period.start ? s : next),
                undefined
            )
    );
}
