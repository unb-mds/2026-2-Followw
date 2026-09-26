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

export function getSemester(semester: string): SemesterCalendar | undefined {
    return academicCalendar.semesters[semester];
}

export function listSemesters(): SemesterCalendar[] {
    return Object.values(academicCalendar.semesters);
}

export default academicCalendar;
