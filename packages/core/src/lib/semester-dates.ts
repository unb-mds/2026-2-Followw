import type { CalendarEvent } from '../calendar.ts';
import type { Classroom } from '../queries/classrooms.ts';
import type { FeedPost } from '../queries/posts.ts';

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

    const enrolled = new Map<number, Classroom>();
    for (const classroom of classrooms) {
        const { sigaa_id, status } = classroom;
        if (
            sigaa_id != null &&
            status !== 'pending_enrollment' &&
            status !== 'denied' &&
            status !== 'trancado'
        ) {
            enrolled.set(sigaa_id, classroom);
        }
    }
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
