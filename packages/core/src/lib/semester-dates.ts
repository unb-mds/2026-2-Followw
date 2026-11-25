import type { CalendarEvent, SemesterCalendar } from '../calendar.ts';
import type { Classroom } from '../queries/classrooms.ts';
import type { FeedPost } from '../queries/posts.ts';

import { isEnrolled } from '../queries/classrooms.ts';
import { daysFrom, formatClassroomDate } from './classroom-details.ts';

/** Quanto do período de aulas passou em `today` e a frase que o resume. */
export function semesterProgress({ classes: { start, end } }: SemesterCalendar, today: string) {
    const duration = daysFrom(start, end);
    const elapsed = daysFrom(start, today);
    const remaining = daysFrom(today, end);
    const percent = remaining <= 0 ? 100 : Math.round((100 * Math.max(0, elapsed)) / duration);
    if (today < start) {
        return { percent, status: `Aulas começam em ${formatClassroomDate(start).slice(0, 5)}` };
    }
    if (today > end) return { percent, status: 'Período de aulas encerrado' };
    const weeks = Math.ceil((duration + 1) / 7);
    const week = Math.min(weeks, Math.floor(elapsed / 7) + 1);
    const countdown =
        remaining === 0
            ? 'Último dia de aulas'
            : `${remaining} ${remaining === 1 ? 'dia' : 'dias'} até o fim das aulas`;
    return { percent, status: `Semana ${week} de ${weeks} · ${countdown}` };
}

export function upcomingSemesterDates(
    today: string,
    calendar: CalendarEvent[],
    classrooms: Classroom[] = [],
    posts: FeedPost[] = []
) {
    const dates = new Map<
        string,
        { id: string; date: string; title: string; classroom?: Classroom }
    >();
    for (const event of calendar) {
        if (event.start_date < today) continue;
        const id = `calendar:${event.start_date}:${event.name}`;
        dates.set(id, { id, date: event.start_date, title: event.name });
    }

    const enrolled = new Map(
        classrooms.filter(isEnrolled).map((classroom) => [classroom.sigaa_id, classroom])
    );
    for (const { post } of posts) {
        const { starts_on, classroom_sigaa_id, title } = post;
        if (
            post.type !== 'assessment' ||
            !starts_on ||
            starts_on < today ||
            classroom_sigaa_id == null
        )
            continue;
        const classroom = enrolled.get(classroom_sigaa_id);
        if (!classroom) continue;
        const id = `assessment:${classroom.id}:${starts_on}:${title}`;
        dates.set(id, { id, date: starts_on, title, classroom });
    }

    return [...dates.values()].toSorted((a, b) => a.date.localeCompare(b.date));
}
