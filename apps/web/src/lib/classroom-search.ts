import { CLASSROOM_TABS } from '@followw/core/lib/classroom-details.ts';
import { createLoader, createStandardSchemaV1, parseAsStringLiteral } from 'nuqs/server';

export const classroomSearchParsers = {
    tab: parseAsStringLiteral(CLASSROOM_TABS).withDefault('frequency')
};

export const validateClassroomSearch = createStandardSchemaV1(classroomSearchParsers, {
    partialOutput: true
});
export const loadClassroomSearch = createLoader(classroomSearchParsers);
