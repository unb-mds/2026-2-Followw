import type { Classroom } from '#/queries/classrooms';
import type {
    CourseCurriculum,
    CurriculumRequirements,
    CurriculumSubject
} from '#/queries/curriculum';

import { curriculumEdges } from '#/lib/curriculum/relations';
import { titleCase } from '#/lib/profile';
import { approvedCodes } from '#/queries/subjects';

export type AcademicState = 'completed' | 'enrolled' | 'overdue' | 'pending' | 'unknown';
export const stateLabels: Record<AcademicState, string> = {
    completed: 'Concluída',
    enrolled: 'Em curso',
    overdue: 'Atrasada',
    pending: 'Pendente',
    unknown: 'Histórico indisponível'
};
export type FlowSubject = CurriculumSubject & { period: number };
export interface FlowEdge {
    id: string;
    kind: 'prerequisite' | 'corequisite';
    source: string;
    target: string;
    group: number;
    alternative: boolean;
}
export interface CurriculumModel {
    periods: number[];
    subjects: FlowSubject[];
    byCode: Map<string, FlowSubject>;
    edges: FlowEdge[];
}

export function normalizeCurriculum(curriculum: CourseCurriculum): CurriculumModel {
    const periods = [
        ...new Set(curriculum.periods.filter((p) => p.period > 0).map((p) => p.period))
    ].toSorted((a, b) => a - b);
    const byCode = new Map<string, FlowSubject>();
    for (const period of periods) {
        for (const block of curriculum.periods.filter((p) => p.period === period)) {
            for (const subject of block.subjects) {
                if (subject.name?.trim() && !byCode.has(subject.code))
                    byCode.set(subject.code, { ...subject, period });
            }
        }
    }
    const subjects = [...byCode.values()];
    const edges = curriculumEdges(subjects, byCode);
    return { periods, subjects, byCode, edges };
}

export function academicContext(history: Classroom[] | undefined, currentPeriod: number | null) {
    const approved = history ? approvedCodes(history) : null;
    const enrolled = new Set(
        history?.filter((c) => c.status === 'cursando').map((c) => c.subject.code)
    );
    return {
        enrolled,
        state: (subject: FlowSubject): AcademicState => {
            if (!approved) return 'unknown';
            if (approved.has(subject.code)) return 'completed';
            if (enrolled.has(subject.code)) return 'enrolled';
            if (currentPeriod !== null && subject.period <= currentPeriod) return 'overdue';
            return 'pending';
        },
        isEnrolled(selected: string | undefined) {
            return !!selected && enrolled.has(selected);
        }
    };
}

export function initialMobilePeriod(periods: number[], ownCourse: boolean, current: number | null) {
    if (!periods.length) return null;
    if (!ownCourse || current === null) return periods[0];
    return periods.reduce((closest, period) =>
        Math.abs(period - current) < Math.abs(closest - current) ? period : closest
    );
}

const numbers = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 10 });
export function creditText(hours: number | null | undefined, format: 'long' | 'short' = 'long') {
    if (hours == null || !Number.isFinite(hours)) return 'Créditos indisponíveis';
    const credits = hours / 15;
    return `${numbers.format(credits)} ${format === 'short' ? 'cr' : credits === 1 ? 'crédito' : 'créditos'}`;
}
export function hoursText(hours: number | null | undefined) {
    return hours == null ? 'Carga horária indisponível' : `${numbers.format(hours)} h`;
}

export function requirementsText(
    requirements: CurriculumRequirements | null | undefined,
    names: ReadonlyMap<string, string>
): string | null {
    const groups = (requirements ?? []).flatMap((group) => {
        if (!group.length || group.some((code) => !names.get(code)?.trim())) return [];
        return [[...new Set(group)].map((code) => titleCase(names.get(code)!))];
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
