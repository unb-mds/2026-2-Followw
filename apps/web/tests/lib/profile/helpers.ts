import type { Classroom } from '#/queries/classrooms';

export function classroom(
    code: string,
    hours: number | null = 60,
    kind: Classroom['subject']['kind'] = null
): Classroom {
    return {
        id: code,
        number: '01',
        semester: '2026.2',
        current: true,
        status: 'cursando',
        subject: { code, name: code, hours, kind },
        professors: []
    };
}
