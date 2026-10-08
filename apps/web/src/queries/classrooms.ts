import type { components } from '#/queries/schema.gen.ts';

import { api } from '#/queries/api.ts';
import { apiClient } from '#/queries/client.ts';

export type Classroom = components['schemas']['UserClassroom'];

export const classroomsQueryOptions = api.queryOptions('get', '/classrooms');

export const allClassroomsQueryOptions = api.queryOptions('get', '/classrooms', {
    params: { query: { semester: 'all' } }
});

export const classroomNewsQueryOptions = (id: string) =>
    api.queryOptions('get', '/classrooms/{classroom_id}/news', {
        params: { path: { classroom_id: id } }
    });

export const classroomNewsDetailQueryOptions = (id: string, newsId: number) =>
    api.queryOptions('get', '/classrooms/{classroom_id}/news/{news_id}', {
        params: { path: { classroom_id: id, news_id: newsId } }
    });

export const classroomFrequencyQueryOptions = (id: string) =>
    api.queryOptions('get', '/classrooms/{classroom_id}/frequency', {
        params: { path: { classroom_id: id } }
    });

export type ManualAttendanceEntry = components['schemas']['ManualAttendanceEntry'];

export function updateManualFrequencyEntries(
    entries: ManualAttendanceEntry[],
    entry: ManualAttendanceEntry,
    remove: boolean
): ManualAttendanceEntry[] {
    const updated = entries.filter(
        (item) => item.occurred_on !== entry.occurred_on || item.position !== entry.position
    );
    if (!remove) updated.push(entry);
    return updated.toSorted(
        (a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.position - b.position
    );
}

export const manualFrequencyQueryOptions = (id: string) =>
    api.queryOptions('get', '/classrooms/{classroom_id}/frequency/manual', {
        params: { path: { classroom_id: id } }
    });

export async function saveManualFrequency(id: string, entry: ManualAttendanceEntry) {
    await apiClient.PUT('/classrooms/{classroom_id}/frequency/manual', {
        params: { path: { classroom_id: id } },
        body: entry
    });
}

export async function removeManualFrequency(id: string, entry: ManualAttendanceEntry) {
    await apiClient.DELETE('/classrooms/{classroom_id}/frequency/manual/{occurred_on}/{position}', {
        params: {
            path: {
                classroom_id: id,
                occurred_on: entry.occurred_on,
                position: entry.position
            }
        }
    });
}

export const classroomMembersQueryOptions = (id: string) =>
    api.queryOptions('get', '/classrooms/{classroom_id}/members', {
        params: { path: { classroom_id: id } }
    });
