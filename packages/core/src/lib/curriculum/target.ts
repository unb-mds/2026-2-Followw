import type { UserProfile } from '../../queries/me.ts';

import { getCurrentSemester } from '../../calendar.ts';
import { currentCurriculumPeriod } from '../../queries/subjects.ts';

/** O curso do aluno usa o ingresso dele; outro curso, a matriz vigente no semestre atual. */
export function flowTarget(
    user: Pick<UserProfile, 'course' | 'entry_semester'> | null | undefined,
    courseId: number
) {
    const semester = getCurrentSemester()?.semester;
    const ownCourse = courseId === user?.course?.id;
    return {
        ownCourse,
        loggedIn: Boolean(user),
        entrySemester: ownCourse ? user?.entry_semester : semester,
        currentPeriod: ownCourse ? currentCurriculumPeriod(user?.entry_semester, semester) : null
    };
}
