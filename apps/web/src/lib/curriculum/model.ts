import type { AcademicState, CurriculumModel, FlowSubject } from '#/lib/curriculum/types';
import type { Classroom } from '#/queries/classrooms';
import type { CourseCurriculum } from '#/queries/curriculum';

import { curriculumEdges, unlockedSubjects } from '#/lib/curriculum/relations';
import { approvedCodes } from '#/queries/subjects';

export const stateLabels: Record<AcademicState, string> = {
    completed: 'Concluída',
    enrolled: 'Em curso',
    overdue: 'Atrasada',
    pending: 'Pendente',
    unknown: 'Histórico indisponível'
};

/** Só os períodos regulares, sem repetir matérias e sem as que não têm nome no catálogo. */
export function normalizeCurriculum(curriculum: CourseCurriculum): CurriculumModel {
    const blocks = curriculum.periods
        .filter((block) => block.period > 0)
        .toSorted((a, b) => a.period - b.period);
    const byCode = new Map<string, FlowSubject>();
    for (const { period, subjects } of blocks) {
        for (const subject of subjects) {
            const name = subject.name;
            if (name?.trim() && !byCode.has(subject.code))
                byCode.set(subject.code, { ...subject, name, period });
        }
    }
    const subjects = [...byCode.values()];
    const edges = curriculumEdges(subjects, byCode);
    return {
        periods: [...new Set(blocks.map((block) => block.period))],
        subjects,
        byCode,
        edges,
        unlocks: unlockedSubjects(edges, byCode)
    };
}

export function academicState(history: Classroom[] | undefined, currentPeriod: number | null) {
    const approved = history ? approvedCodes(history) : null;
    const enrolled = new Set(
        history?.filter((c) => c.status === 'cursando').map((c) => c.subject.code)
    );
    return (subject: FlowSubject): AcademicState => {
        if (!approved) return 'unknown';
        if (approved.has(subject.code)) return 'completed';
        if (enrolled.has(subject.code)) return 'enrolled';
        if (currentPeriod !== null && subject.period <= currentPeriod) return 'overdue';
        return 'pending';
    };
}

export function initialMobilePeriod(periods: number[], ownCourse: boolean, current: number | null) {
    if (!periods.length) return null;
    if (!ownCourse || current === null) return periods[0];
    return periods.reduce((closest, period) =>
        Math.abs(period - current) < Math.abs(closest - current) ? period : closest
    );
}
