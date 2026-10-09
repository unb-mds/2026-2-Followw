import type { components } from '#/queries/schema.gen';

type Member = components['schemas']['ClassroomMember'];

export function groupMembers(members: Member[]) {
    return {
        professors: members.filter((member) => member.role === 'professor'),
        monitors: members.filter((member) => member.role === 'monitor'),
        students: members.filter((member) => member.role === 'aluno')
    };
}

export function formatClassroomDate(date: string) {
    const [year, month, day] = date.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
}

const weekdayFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });

export function formatClassroomWeekday(date: string) {
    return weekdayFormat.format(new Date(`${date.slice(0, 10)}T00:00:00Z`)).replace('.', '');
}

const relativeFormat = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

export function daysFrom(today: string, date: string) {
    return Math.round((Date.parse(date.slice(0, 10)) - Date.parse(today)) / 86_400_000);
}

export function formatRelativeDay(days: number) {
    const label = relativeFormat.format(days, 'day');
    return label.charAt(0).toUpperCase() + label.slice(1);
}

// a UnB exige 75% de frequência: abaixo disso reprova, até 80% é alerta
export function frequencyTone(percentage: number) {
    if (percentage < 75) return 'danger';
    return percentage <= 80 ? 'warning' : 'ok';
}

export function groupBySemester<T extends { semester: string }>(classrooms: T[]) {
    const groups = new Map<string, T[]>();
    for (const classroom of classrooms) {
        groups.set(classroom.semester, [...(groups.get(classroom.semester) ?? []), classroom]);
    }
    return [...groups].toSorted(([a], [b]) => b.localeCompare(a));
}
