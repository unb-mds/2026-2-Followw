import type { CatalogSubject } from '@followw/core/queries/subjects.ts';

import { getCurrentSemester } from '@followw/core/calendar.ts';
import { allClassroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import {
    approvedCodes,
    currentCurriculumPeriod,
    takenCodes,
    withoutScheduleConflicts
} from '@followw/core/queries/subjects.ts';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { usePlannedSchedule } from '@/components/schedule/usePlannedSchedule';
import { useSubjectFilters } from '@/lib/search-filters';

/** O que toda lista de matérias da busca compartilha: período, cursadas e conflitos ocultos. */
export function useSubjectListing() {
    const { data: user } = useQuery(meQueryOptions);
    const { hideConflicts } = useSubjectFilters();
    const { items } = usePlannedSchedule();
    const { data: history } = useQuery({ ...allClassroomsQueryOptions, enabled: Boolean(user) });
    const completed = user?.completed_subjects;
    const taken = useMemo(
        () => (history ? takenCodes(history, approvedCodes(history, completed)) : null),
        [history, completed]
    );
    const planned = hideConflicts ? items : undefined;
    const visible = useCallback(
        (subjects: CatalogSubject[]) => withoutScheduleConflicts(subjects, planned),
        [planned]
    );
    return {
        currentPeriod: currentCurriculumPeriod(
            user?.entry_semester,
            getCurrentSemester()?.semester
        ),
        taken,
        visible
    };
}
