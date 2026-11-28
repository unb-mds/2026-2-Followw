import type { Classroom } from '../../queries/classrooms.ts';
import type { CourseCurriculum, CurriculumSubject } from '../../queries/curriculum.ts';

import { approvedCodes, normalizeCode } from '../../queries/subjects.ts';

export type CompletedSubjects = Record<string, number | null>;

export function estimatedProgress(
    matrix: CourseCurriculum,
    history: Classroom[],
    completedSubjects?: CompletedSubjects
) {
    const {
        total_workload: total,
        required_workload: required,
        optional_min_workload: optional,
        complementary_min_workload: complementary,
        elective_max_workload: freeLimit
    } = matrix;
    if (
        !total ||
        required == null ||
        optional == null ||
        complementary == null ||
        freeLimit == null
    )
        return null;

    const available = approvedCodes(history, completedSubjects);
    const hours = new Map<string, number>();
    if (completedSubjects) {
        for (const [code, value] of Object.entries(completedSubjects)) {
            if (value != null) hours.set(normalizeCode(code), value);
        }
    }
    for (const { subject } of history) {
        if (subject.hours != null) hours.set(normalizeCode(subject.code), subject.hours);
    }

    const listed = new Set<string>();
    function credit(subjects: CurriculumSubject[]) {
        let credited = 0;
        const unmatched: CurriculumSubject[] = [];
        for (const subject of subjects) {
            const code = normalizeCode(subject.code);
            if (listed.has(code)) continue;
            listed.add(code);
            if (available.delete(code)) credited += subject.hours ?? hours.get(code) ?? 0;
            else unmatched.push(subject);
        }
        for (const subject of unmatched) {
            const group = subject.equivalences?.find(
                (codes) =>
                    codes.length > 0 &&
                    codes.every(({ code }) => available.has(normalizeCode(code)))
            );
            if (!group || !subject.hours) continue;
            for (const { code } of group) available.delete(normalizeCode(code));
            credited += subject.hours;
        }
        return credited;
    }

    const mandatoryHours = credit(
        matrix.periods.filter((p) => p.period > 0).flatMap((p) => p.subjects)
    );
    const optionalHours = credit(
        matrix.periods.filter((p) => p.period === 0).flatMap((p) => p.subjects)
    );
    const complementaryHours = credit(matrix.complementary);
    let freeHours = 0;
    for (const code of available) freeHours += hours.get(code) ?? 0;

    // Quando os mínimos não somam a carga total, optativas extras preenchem o saldo.
    const optionalCap = Math.max(optional, total - required - complementary);
    const completed = Math.min(
        total,
        Math.min(required, mandatoryHours) +
            Math.min(optionalCap, optionalHours + Math.min(freeLimit, freeHours)) +
            Math.min(complementary, complementaryHours)
    );
    return { completed, total, percentage: (completed / total) * 100 };
}
