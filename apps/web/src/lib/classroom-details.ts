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
