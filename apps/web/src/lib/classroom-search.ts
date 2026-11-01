import { createLoader, createStandardSchemaV1, parseAsStringLiteral } from 'nuqs/server';

export const CLASSROOM_TABS = ['frequency', 'statistics', 'posts', 'members'] as const;
export type ClassroomTab = (typeof CLASSROOM_TABS)[number];

export const classroomSearchParsers = {
    tab: parseAsStringLiteral(CLASSROOM_TABS).withDefault('frequency')
};

export const validateClassroomSearch = createStandardSchemaV1(classroomSearchParsers, {
    partialOutput: true
});
export const loadClassroomSearch = createLoader(classroomSearchParsers);

export function classroomTab(tab: ClassroomTab, current: boolean): ClassroomTab {
    return tab === 'frequency' || tab === 'statistics'
        ? current
            ? 'frequency'
            : 'statistics'
        : tab;
}
