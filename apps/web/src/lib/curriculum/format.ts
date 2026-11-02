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

/** Alternativas (OU) de matérias (E); grupos com alguma matéria sem nome no catálogo ficam de fora. */
export function requirementGroups(requirements: Requirements | null | undefined) {
    const groups = new Map<string, string[]>();
    for (const group of requirements ?? []) {
        const names = [
            ...new Map(group.map(({ code, subject }) => [code, subject?.name.trim()])).values()
        ];
        if (!names.length || names.some((name) => !name)) continue;
        const titles = names.map((name) => titleCase(name!));
        groups.set(titles.join('|'), titles);
    }
    return groups.size ? [...groups.values()] : null;
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
