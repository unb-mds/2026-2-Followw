import type { Classroom } from '../../queries/classrooms.ts';
import type { CourseCurriculum, CurriculumSubject } from '../../queries/curriculum.ts';

import { approvedCodes } from '../../queries/subjects.ts';

export function estimatedProgress(
    matrix: CourseCurriculum,
    history: Classroom[],
    completedSubjects?: readonly string[],
    completedHours: Record<string, number | null> = {}
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
    const hours = new Map(Object.entries(completedHours));
    for (const { subject } of history)
        if (subject.hours != null) hours.set(subject.code, subject.hours);

    const listed = new Set<string>();
    function credit(subjects: CurriculumSubject[]) {
        let credited = 0;
        const unmatched: CurriculumSubject[] = [];
        for (const subject of subjects) {
            if (listed.has(subject.code)) continue;
            listed.add(subject.code);
            if (available.delete(subject.code))
                credited += subject.hours ?? hours.get(subject.code) ?? 0;
            else unmatched.push(subject);
        }
        for (const subject of unmatched) {
            const group = subject.equivalences?.find(
                (codes) => codes.length > 0 && codes.every(({ code }) => available.has(code))
            );
            if (!group || !subject.hours) continue;
            for (const { code } of group) available.delete(code);
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
    for (const code of available) if (!listed.has(code)) freeHours += hours.get(code) ?? 0;

    const completed = Math.min(
        total,
        Math.min(required, mandatoryHours) +
            Math.min(optional, optionalHours + Math.min(freeLimit, freeHours)) +
            Math.min(complementary, complementaryHours)
    );
    return { completed, total, percentage: (completed / total) * 100 };
}
