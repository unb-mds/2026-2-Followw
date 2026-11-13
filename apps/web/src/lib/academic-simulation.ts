import type { Classroom } from '#/queries/classrooms';

import { STORAGE_KEYS, storedValue } from '#/lib/local-storage';
import { currentCurriculumPeriod } from '#/queries/subjects';

export const gradeWeights = { SS: 5, MS: 4, MM: 3, MI: 2, II: 1, SR: 0 } as const;
export type Grade = keyof typeof gradeWeights;
export type SimulatedGrades = Partial<Record<string, Grade | null>>;

export const isGrade = (value: string): value is Grade => Object.hasOwn(gradeWeights, value);

export const simulatedGrades = storedValue<SimulatedGrades>(STORAGE_KEYS.ACADEMIC_SIMULATION, {});

const subjectCode = (code: string) => code.trim().toUpperCase();

export function simulationClassrooms(
    classrooms: Classroom[],
    entry: string | null,
    current: string | undefined
) {
    const subjects = new Map<string, Classroom>();
    for (const classroom of classrooms) {
        if (
            (entry && classroom.semester < entry) ||
            (current && classroom.semester > current) ||
            classroom.status === 'trancado' ||
            classroom.status === 'denied' ||
            classroom.status === 'pending_enrollment'
        )
            continue;
        const key = simulationKey(classroom);
        const previous = subjects.get(key);
        if (!previous || (!previous.grade && classroom.grade)) subjects.set(key, classroom);
    }
    return [...subjects.values()];
}

export const simulationKey = ({ semester, subject }: Classroom) =>
    `${semester}:${subjectCode(subject.code)}`;

export function simulationGrade(classroom: Classroom, overrides: SimulatedGrades) {
    const override = overrides[simulationKey(classroom)];
    if (override === null || (override && isGrade(override))) return override;
    return classroom.grade ?? null;
}

export function simulateIndexes(
    semesters: [string, Classroom[]][],
    entry: string | null,
    current: string | undefined,
    curriculum: Set<string> | null,
    overrides: SimulatedGrades
) {
    let iraPoints = 0;
    let iraWeight = 0;
    let mpPoints = 0;
    let mpWeight = 0;
    const evolution: { semester: string; ira: number; projected: boolean }[] = [];
    for (const [semester, classrooms] of semesters.toReversed()) {
        const period = currentCurriculumPeriod(entry, semester);
        let hasGrade = false;
        for (const classroom of classrooms) {
            const grade = simulationGrade(classroom, overrides);
            const hours = classroom.subject.hours;
            if (grade === null || !hours || hours < 0) continue;
            hasGrade = true;
            if (period !== null) {
                const weight = hours * Math.min(period, 6);
                iraPoints += gradeWeights[grade] * weight;
                iraWeight += weight;
            }
            if (curriculum?.has(subjectCode(classroom.subject.code))) {
                mpPoints += gradeWeights[grade] * hours;
                mpWeight += hours;
            }
        }
        const projected = semester === current;
        if (iraWeight > 0 && period !== null && (!projected || hasGrade)) {
            evolution.push({ semester, ira: iraPoints / iraWeight, projected });
        }
    }
    return {
        ira: iraWeight > 0 ? iraPoints / iraWeight : null,
        mp: mpWeight > 0 ? mpPoints / mpWeight : null,
        evolution
    };
}

export const isFreeModule = (classroom: Classroom, curriculum: Set<string> | null) =>
    curriculum !== null && !curriculum.has(subjectCode(classroom.subject.code));
