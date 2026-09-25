import calendarData from '@calendar';

export type CalendarEventCategory =
    | 'academic'
    | 'administrative'
    | 'enrollment'
    | 'holiday'
    | 'optional_holiday'
    | 'university_week'
    | 'other';

export interface CalendarEvent {
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

export interface YearCalendar {
    year: number;
    resolution: string;
    semesters: Record<string, SemesterCalendar>;
}

export interface AcademicCalendar {
    description: string;
    source: string;
    years: Record<string, YearCalendar>;
}

export const academicCalendar: AcademicCalendar = calendarData;

export function getSemester(semester: string): SemesterCalendar | undefined {
    const yearStr = semester.split('.')[0];
    return academicCalendar.years[yearStr]?.semesters[semester];
}

export function listSemesters(): SemesterCalendar[] {
    return Object.values(academicCalendar.years).flatMap((year) => Object.values(year.semesters));
}

export default academicCalendar;
