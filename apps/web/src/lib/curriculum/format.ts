import type { FlowEdge, FlowSubject } from '#/lib/curriculum/types';
import type { Requirements } from '#/queries/subjects';

import { titleCase } from '#/lib/profile';

const numbers = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 10 });

export function creditText(hours: number | null | undefined, format: 'long' | 'short' = 'long') {
    if (hours == null || !Number.isFinite(hours)) return 'Créditos indisponíveis';
    const credits = hours / 15;
    return `${numbers.format(credits)} ${format === 'short' ? 'cr' : credits === 1 ? 'crédito' : 'créditos'}`;
}

export function hoursText(hours: number | null | undefined) {
    return hours == null ? 'Carga horária indisponível' : `${numbers.format(hours)} h`;
}

/** "(A e B) ou C"; grupos com alguma matéria sem nome no catálogo ficam de fora. */
export function requirementsText(requirements: Requirements | null | undefined): string | null {
    const groups = (requirements ?? []).flatMap((group) => {
        const names = [
            ...new Map(group.map(({ code, subject }) => [code, subject?.name.trim()])).values()
        ];
        if (!names.length || names.some((name) => !name)) return [];
        return [names.map((name) => titleCase(name!))];
    });
    if (!groups.length) return null;
    return [
        ...new Set(
            groups.map((group) => {
                const text = group.join(' e ');
                return groups.length > 1 && group.length > 1 ? `(${text})` : text;
            })
        )
    ].join(' ou ');
}

const subjectList = new Intl.ListFormat('pt-BR', { type: 'conjunction' });

export function subjectsText(subjects: FlowSubject[] | undefined): string | null {
    return subjects?.length
        ? subjectList.format(subjects.map((subject) => titleCase(subject.name)))
        : null;
}

export function edgeLabel(edge: FlowEdge, byCode: ReadonlyMap<string, FlowSubject>) {
    const corequisite = edge.kind === 'corequisite';
    const end = (code: string) => `${code} (${byCode.get(code)!.period}º semestre)`;
    return [
        `${end(edge.source)} ${corequisite ? '↔' : '→'} ${end(edge.target)}`,
        corequisite ? ': correquisito (cursar em conjunto)' : ': pré-requisito',
        edge.alternative ? `; alternativa ${edge.group}; E dentro do grupo, OU entre grupos` : ''
    ].join('');
}
